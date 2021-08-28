# Lab10: mmap

本实验是实现一个内存映射文件的功能，将文件映射到内存中，从而在与文件交互时减少磁盘操作。

(1). 根据提示1，首先是配置`mmap`和`munmap`系统调用，此前已进行过多次类似流程，不再赘述。在***kernel/fcntl.h***中定义了宏，只有在定义了`LAB_MMAP`时这些宏才生效，而`LAB_MMAP`是在编译时在命令行通过gcc的`-D`参数定义的

```c
void* mmap(void* addr, int length, int prot, int flags, int fd, int offset);
int munmap(void* addr, int length);
```

(2). 根据提示3，定义VMA结构体，并添加到进程结构体中

```c
#define NVMA 16
// 虚拟内存区域结构体
struct vm_area {
  int used;           // 是否已被使用
  uint64 addr;        // 起始地址
  int len;            // 长度
  int prot;           // 权限
  int flags;          // 标志位
  int vfd;            // 对应的文件描述符
  struct file* vfile; // 对应文件
  int offset;         // 文件偏移，本实验中一直为0
};

struct proc {
  ...
  struct vm_area vma[NVMA];    // 虚拟内存区域
}
```

(3). 在allocproc中将vma数组初始化为全0

```c
static struct proc*
allocproc(void)
{
  ...

found:
  ...

  memset(&p->vma, 0, sizeof(p->vma));
  return p;
}
```

(4). 根据提示2、3、4，参考lazy实验中的分配方法（将当前`p->sz`作为分配的虚拟起始地址，但不实际分配物理页面），此函数写在***sysfile.c***中就可以使用静态函数`argfd`同时解析文件描述符和`struct file`

```c
uint64
sys_mmap(void) {
  uint64 addr;
  int length;
  int prot;
  int flags;
  int vfd;
  struct file* vfile;
  int offset;
  uint64 err = 0xffffffffffffffff;

  // 获取系统调用参数
  if(argaddr(0, &addr) < 0 || argint(1, &length) < 0 || argint(2, &prot) < 0 ||
    argint(3, &flags) < 0 || argfd(4, &vfd, &vfile) < 0 || argint(5, &offset) < 0)
    return err;

  // 实验提示中假定addr和offset为0，简化程序可能发生的情况
  if(addr != 0 || offset != 0 || length < 0)
    return err;

  // 文件不可写则不允许拥有PROT_WRITE权限时映射为MAP_SHARED
  if(vfile->writable == 0 && (prot & PROT_WRITE) != 0 && flags == MAP_SHARED)
    return err;

  struct proc* p = myproc();
  // 没有足够的虚拟地址空间
  if(p->sz + length > MAXVA)
    return err;

  // 遍历查找未使用的VMA结构体
  for(int i = 0; i < NVMA; ++i) {
    if(p->vma[i].used == 0) {
      p->vma[i].used = 1;
      p->vma[i].addr = p->sz;
      p->vma[i].len = length;
      p->vma[i].flags = flags;
      p->vma[i].prot = prot;
      p->vma[i].vfile = vfile;
      p->vma[i].vfd = vfd;
      p->vma[i].offset = offset;

      // 增加文件的引用计数
      filedup(vfile);

      p->sz += length;
      return p->vma[i].addr;
    }
  }

  return err;
}
```

(5). 根据提示5，此时访问对应的页面就会产生页面错误，需要在`usertrap`中进行处理，主要完成三项工作：分配物理页面，读取文件内容，添加映射关系

```c
void
usertrap(void)
{
  ...
  if(cause == 8) {
    ...
  } else if((which_dev = devintr()) != 0){
    // ok
  } else if(cause == 13 || cause == 15) {
#ifdef LAB_MMAP
    // 读取产生页面故障的虚拟地址，并判断是否位于有效区间
    uint64 fault_va = r_stval();
    if(PGROUNDUP(p->trapframe->sp) - 1 < fault_va && fault_va < p->sz) {
      if(mmap_handler(r_stval(), cause) != 0) p->killed = 1;
    } else
      p->killed = 1;
#endif
  } else {
    ...
  }

  ...
}

/**
 * @brief mmap_handler 处理mmap惰性分配导致的页面错误
 * @param va 页面故障虚拟地址
 * @param cause 页面故障原因
 * @return 0成功，-1失败
 */
int mmap_handler(int va, int cause) {
  int i;
  struct proc* p = myproc();
  // 根据地址查找属于哪一个VMA
  for(i = 0; i < NVMA; ++i) {
    if(p->vma[i].used && p->vma[i].addr <= va && va <= p->vma[i].addr + p->vma[i].len - 1) {
      break;
    }
  }
  if(i == NVMA)
    return -1;

  int pte_flags = PTE_U;
  if(p->vma[i].prot & PROT_READ) pte_flags |= PTE_R;
  if(p->vma[i].prot & PROT_WRITE) pte_flags |= PTE_W;
  if(p->vma[i].prot & PROT_EXEC) pte_flags |= PTE_X;


  struct file* vf = p->vma[i].vfile;
  // 读导致的页面错误
  if(cause == 13 && vf->readable == 0) return -1;
  // 写导致的页面错误
  if(cause == 15 && vf->writable == 0) return -1;

  void* pa = kalloc();
  if(pa == 0)
    return -1;
  memset(pa, 0, PGSIZE);

  // 读取文件内容
  ilock(vf->ip);
  // 计算当前页面读取文件的偏移量，实验中p->vma[i].offset总是0
  // 要按顺序读读取，例如内存页面A,B和文件块a,b
  // 则A读取a，B读取b，而不能A读取b，B读取a
  int offset = p->vma[i].offset + PGROUNDDOWN(va - p->vma[i].addr);
  int readbytes = readi(vf->ip, 0, (uint64)pa, offset, PGSIZE);
  // 什么都没有读到
  if(readbytes == 0) {
    iunlock(vf->ip);
    kfree(pa);
    return -1;
  }
  iunlock(vf->ip);

  // 添加页面映射
  if(mappages(p->pagetable, PGROUNDDOWN(va), PGSIZE, (uint64)pa, pte_flags) != 0) {
    kfree(pa);
    return -1;
  }

  return 0;
}
```

(6). 根据提示6实现`munmap`，且提示7中说明无需查看脏位就可写回

```c
uint64
sys_munmap(void) {
  uint64 addr;
  int length;
  if(argaddr(0, &addr) < 0 || argint(1, &length) < 0)
    return -1;

  int i;
  struct proc* p = myproc();
  for(i = 0; i < NVMA; ++i) {
    if(p->vma[i].used && p->vma[i].len >= length) {
      // 根据提示，munmap的地址范围只能是
      // 1. 起始位置
      if(p->vma[i].addr == addr) {
        p->vma[i].addr += length;
        p->vma[i].len -= length;
        break;
      }
      // 2. 结束位置
      if(addr + length == p->vma[i].addr + p->vma[i].len) {
        p->vma[i].len -= length;
        break;
      }
    }
  }
  if(i == NVMA)
    return -1;

  // 将MAP_SHARED页面写回文件系统
  if(p->vma[i].flags == MAP_SHARED && (p->vma[i].prot & PROT_WRITE) != 0) {
    filewrite(p->vma[i].vfile, addr, length);
  }

  // 判断此页面是否存在映射
  uvmunmap(p->pagetable, addr, length / PGSIZE, 1);


  // 当前VMA中全部映射都被取消
  if(p->vma[i].len == 0) {
    fileclose(p->vma[i].vfile);
    p->vma[i].used = 0;
  }

  return 0;
}
```

(7). 回忆lazy实验中，如果对惰性分配的页面调用了`uvmunmap`，或者子进程在fork中调用`uvmcopy`复制了父进程惰性分配的页面都会导致panic，因此需要修改`uvmunmap`和`uvmcopy`检查`PTE_V`后不再`panic`

```c
if((*pte & PTE_V) == 0)
  continue;
```

(8). 根据提示8修改`exit`，将进程的已映射区域取消映射

```c
void
exit(int status)
{
  // Close all open files.
  for(int fd = 0; fd < NOFILE; fd++){
    ...
  }

  // 将进程的已映射区域取消映射
  for(int i = 0; i < NVMA; ++i) {
    if(p->vma[i].used) {
      if(p->vma[i].flags == MAP_SHARED && (p->vma[i].prot & PROT_WRITE) != 0) {
        filewrite(p->vma[i].vfile, p->vma[i].addr, p->vma[i].len);
      }
      fileclose(p->vma[i].vfile);
      uvmunmap(p->pagetable, p->vma[i].addr, p->vma[i].len / PGSIZE, 1);
      p->vma[i].used = 0;
    }
  }

  begin_op();
  iput(p->cwd);
  end_op();
  ...
}
```

(9). 根据提示9，修改`fork`，复制父进程的VMA并增加文件引用计数

```c
int
fork(void)
{
 // increment reference counts on open file descriptors.
  for(i = 0; i < NOFILE; i++)
    ...
  ...

  // 复制父进程的VMA
  for(i = 0; i < NVMA; ++i) {
    if(p->vma[i].used) {
      memmove(&np->vma[i], &p->vma[i], sizeof(p->vma[i]));
      filedup(p->vma[i].vfile);
    }
  }

  safestrcpy(np->name, p->name, sizeof(p->name));
  
  ...
}
```