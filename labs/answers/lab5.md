# Lab5: xv6 lazy page allocation

# Eliminate allocation from sbrk()

这个实验很简单，就仅仅改动`sys_sbrk()`函数即可，将实际分配内存的函数删除，而仅仅改变进程的`sz`属性

```c
uint64
sys_sbrk(void)
{
  int addr;
  int n;

  if(argint(0, &n) < 0)
    return -1;
  
  addr = myproc()->sz;
  // lazy allocation
  myproc()->sz += n;

  return addr;
}
```



# Lazy allocation

根据提示来做就好，另外6.S081对应的视频课程中对这部分代码做出了很大一部分的解答。

**(1)**. 修改`usertrap()`(***kernel/trap.c***)函数，使用`r_scause()`判断是否为页面错误，在页面错误处理的过程中，先判断发生错误的虚拟地址（`r_stval()`读取）是否位于栈空间之上，进程大小（虚拟地址从0开始，进程大小表征了进程的最高虚拟地址）之下，然后分配物理内存并添加映射

```c
  uint64 cause = r_scause();
  if(cause == 8) {
    ...
  } else if((which_dev = devintr()) != 0) {
    // ok
  } else if(cause == 13 || cause == 15) {
    // 处理页面错误
    uint64 fault_va = r_stval();  // 产生页面错误的虚拟地址
    char* pa;                     // 分配的物理地址
    if(PGROUNDUP(p->trapframe->sp) - 1 < fault_va && fault_va < p->sz &&
      (pa = kalloc()) != 0) {
        memset(pa, 0, PGSIZE);
        if(mappages(p->pagetable, PGROUNDDOWN(fault_va), PGSIZE, (uint64)pa, PTE_R | PTE_W | PTE_X | PTE_U) != 0) {
          kfree(pa);
          p->killed = 1;
        }
    } else {
      // printf("usertrap(): out of memory!\n");
      p->killed = 1;
    }
  } else {
    ...
  }
```

**(2)**. 修改`uvmunmap()`(***kernel/vm.c***)，之所以修改这部分代码是因为lazy allocation中首先并未实际分配内存，所以当解除映射关系的时候对于这部分内存要略过，而不是使系统崩溃，这部分在课程视频中已经解答。

```c
void
uvmunmap(pagetable_t pagetable, uint64 va, uint64 npages, int do_free)
{
  ...

  for(a = va; a < va + npages*PGSIZE; a += PGSIZE){
    if((pte = walk(pagetable, a, 0)) == 0)
      panic("uvmunmap: walk");
    if((*pte & PTE_V) == 0)
      continue;

    ...
  }
}
```



# Lazytests and Usertests

**(1)**. 处理`sbrk()`参数为负数的情况，参考之前`sbrk()`调用的`growproc()`程序，如果为负数，就调用`uvmdealloc()`函数，但需要限制缩减后的内存空间不能小于0

```c
uint64
sys_sbrk(void)
{
  int addr;
  int n;

  if(argint(0, &n) < 0)
    return -1;

  struct proc* p = myproc();
  addr = p->sz;
  uint64 sz = p->sz;

  if(n > 0) {
    // lazy allocation
    p->sz += n;
  } else if(sz + n > 0) {
    sz = uvmdealloc(p->pagetable, sz, sz + n);
    p->sz = sz;
  } else {
    return -1;
  }
  return addr;
}
```

**(2)**. 正确处理`fork`的内存拷贝：`fork`调用了`uvmcopy`进行内存拷贝，所以修改`uvmcopy`如下

```c
int
uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
{
  ...
  for(i = 0; i < sz; i += PGSIZE){
    if((pte = walk(old, i, 0)) == 0)
      continue;
    if((*pte & PTE_V) == 0)
      continue;
    ...
  }
  ...
}
```

**(3)**. 还需要继续修改`uvmunmap`，否则会运行出错，关于为什么要使用两个`continue`，请看本文最下面

```c
void
uvmunmap(pagetable_t pagetable, uint64 va, uint64 npages, int do_free)
{
  ...

  for(a = va; a < va + npages*PGSIZE; a += PGSIZE){
    if((pte = walk(pagetable, a, 0)) == 0)
      continue;
    if((*pte & PTE_V) == 0)
      continue;

    ...
  }
}
```

**(4)**. 处理通过sbrk申请内存后还未实际分配就传给系统调用使用的情况，系统调用的处理会陷入内核，scause寄存器存储的值是8，如果此时传入的地址还未实际分配，就不能走到上文usertrap中判断scause是13或15后进行内存分配的代码，syscall执行就会失败

- 系统调用流程：

  - 陷入内核**==>**`usertrap`中`r_scause()==8`的分支**==>**`syscall()`**==>**回到用户空间

- 页面错误流程：

  - 陷入内核**==>**`usertrap`中`r_scause()==13||r_scause()==15`的分支**==>**分配内存**==>**回到用户空间

因此就需要找到在何时系统调用会使用这些地址，将地址传入系统调用后，会通过`argaddr`函数(***kernel/syscall.c***)从寄存器中读取，因此在这里添加物理内存分配的代码

```c
int
argaddr(int n, uint64 *ip)
{
  *ip = argraw(n);
  struct proc* p = myproc();

  // 处理向系统调用传入lazy allocation地址的情况
  if(walkaddr(p->pagetable, *ip) == 0) {
    if(PGROUNDUP(p->trapframe->sp) - 1 < *ip && *ip < p->sz) {
      char* pa = kalloc();
      if(pa == 0)
        return -1;
      memset(pa, 0, PGSIZE);

      if(mappages(p->pagetable, PGROUNDDOWN(*ip), PGSIZE, (uint64)pa, PTE_R | PTE_W | PTE_X | PTE_U) != 0) {
        kfree(pa);
        return -1;
      }
    } else {
      return -1;
    }
  }

  return 0;
}
```

## 为什么使用两个continue

这里需要解释一下为什么在两个判断中使用了`continue`语句，在课程视频中仅仅添加了第二个`continue`，利用`vmprint`打印出来初始时刻用户进程的页表如下

```
page table 0x0000000087f55000
..0: pte 0x0000000021fd3c01 pa 0x0000000087f4f000
.. ..0: pte 0x0000000021fd4001 pa 0x0000000087f50000
.. .. ..0: pte 0x0000000021fd445f pa 0x0000000087f51000
.. .. ..1: pte 0x0000000021fd4cdf pa 0x0000000087f53000
.. .. ..2: pte 0x0000000021fd900f pa 0x0000000087f64000
.. .. ..3: pte 0x0000000021fd5cdf pa 0x0000000087f57000
..255: pte 0x0000000021fd5001 pa 0x0000000087f54000
.. ..511: pte 0x0000000021fd4801 pa 0x0000000087f52000
.. .. ..510: pte 0x0000000021fd58c7 pa 0x0000000087f56000
.. .. ..511: pte 0x0000000020001c4b pa 0x0000000080007000
```

除去高地址的trapframe和trampoline页面，进程共计映射了4个有效页面，即添加了映射关系的虚拟地址范围是`0x0000~0x3fff`，假如使用`sbrk`又申请了一个页面，由于lazy allocation，页表暂时不会改变，而不经过读写操作后直接释放进程，进程将会调用`uvmunmap`函数，此时将会发生什么呢？

`uvmunmap`首先使用`walk`找到虚拟地址对应的PTE地址，虚拟地址的最后12位表征了偏移量，前面每9位索引一级页表，将`0x4000`的虚拟地址写为二进制（省略前面的无效位）：

```
{000 0000 00}[00 0000 000](0 0000 0100) 0000 0000 0000
```

- `{}`：页目录表索引(level==2)，为0
- `[]`：二级页表索引(level==1)，为0
- `()`：三级页表索引(level==0)，为4

我们来看一下`walk`函数，`walk`返回指定虚拟地址的PTE，但我认为这个程序存在一定的不足。walk函数的代码如下所示

```c
pte_t *
walk(pagetable_t pagetable, uint64 va, int alloc)
{
  if(va >= MAXVA)
    panic("walk");

  for(int level = 2; level > 0; level--) {
    pte_t *pte = &pagetable[PX(level, va)];
    if(*pte & PTE_V) {
      pagetable = (pagetable_t)PTE2PA(*pte);
    } else {
      if(!alloc || (pagetable = (pde_t*)kalloc()) == 0)
        return 0;
      memset(pagetable, 0, PGSIZE);
      *pte = PA2PTE(pagetable) | PTE_V;
    }
  }
  return &pagetable[PX(0, va)];
}
```

这段代码中`for`循环执行`level==2`和`level==1`的情况，而对照刚才打印的页表，`level==2`时索引为0的项是存在的，`level==1`时索引为0的项也是存在的，最后执行`return`语句，然而level==0时索引为4的项却是不存在的，此时`walk`不再检查`PTE_V`标志等信息，而是直接返回，因此即使虚拟地址对应的PTE实际不存在，`walk`函数的返回值也可能不为0！

那么返回的这个地址是什么呢？level为0时

有效索引为0~3，因此索引为4时返回的是最后一个有效PTE后面的一个地址。

因此我们不能仅靠PTE为0来判断虚拟地址无效，还需要再次检查返回的PTE中是否设置了`PTE_V`标志位。
