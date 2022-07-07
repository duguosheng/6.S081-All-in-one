# lab2: syscall

## trace

本实验主要是实现一个追踪系统调用的函数，那么首先根据提示定义`trace`系统调用，并修复编译错误。

首先看一下*user/trace.c*的内容，主要的代码如下

```c
if (trace(atoi(argv[1])) < 0) {
    fprintf(2, "%s: trace failed\n", argv[0]);
    exit(1);
}
for(i = 2; i < argc && i < MAXARG; i++){
    nargv[i-2] = argv[i];
}
exec(nargv[0], nargv);
```

它首先调用`trace(int)`，然后将命令行中的参数`argv`复制到`nargv`中，同时删去前两个参数，例如

```text
argv  = trace 32 grep hello README
nargv = grep hello README
```

那么，根据提示，我们首先再`proc`结构体中添加一个数据字段，用于保存`trace`的参数。并在`sys_trace()`的实现中实现参数的保存

```c
// kernel/proc.h
struct proc {
  // ...
  int trace_mask;    // trace系统调用参数
};

// kernel/sysproc.c
uint64
sys_trace(void)
{
  // 获取系统调用的参数
  argint(0, &(myproc()->trace_mask));
  return 0;
}
```

由于`struct proc`中增加了一个新的变量,当`fork`的时候我们也需要将这个变量传递到子进程中(提示中已说明)

```c
//kernel/proc.c
int
fork(void)
{
  // ...

  safestrcpy(np->name, p->name, sizeof(p->name));

  //将trace_mask拷贝到子进程
  np->trace_mask = p->trace_mask;

  pid = np->pid;
  // ...

  return pid;
}
```

接下来应当考虑如何进行系统调用追踪了，根据提示，这将在`syscall()`函数中实现。下面是实现代码，需要注意的是条件判断中使用了`&`而不是`==`，这是因为在实验说明书的例子中，`trace 2147483647 grep hello README`将所有31个低位置为1，使得其可以追踪所有的系统调用。

```c
void
syscall(void)
{
  int num;
  struct proc *p = myproc();

  num = p->trapframe->a7;  // 系统调用编号，参见书中4.3节
  if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
    p->trapframe->a0 = syscalls[num]();  // 执行系统调用，然后将返回值存入a0

    // 系统调用是否匹配
    if ((1 << num) & p->trace_mask)
      printf("%d: syscall %s -> %d\n", p->pid, syscalls_name[num], p->trapframe->a0);
  } else {
    printf("%d %s: unknown sys call %d\n",
            p->pid, p->name, num);
    p->trapframe->a0 = -1;
  }
}
```

在上面的代码中，我们还有一些引用的变量尚未定义，在*syscall.c*中定义他们

```c
// ...
extern uint64 sys_trace(void);

static uint64 (*syscalls[])(void) = {
// ...
[SYS_trace]   sys_trace,
};

static char *syscalls_name[] = {
[SYS_fork]    "fork",
[SYS_exit]    "exit",
[SYS_wait]    "wait",
[SYS_pipe]    "pipe",
[SYS_read]    "read",
[SYS_kill]    "kill",
[SYS_exec]    "exec",
[SYS_fstat]   "fstat",
[SYS_chdir]   "chdir",
[SYS_dup]     "dup",
[SYS_getpid]  "getpid",
[SYS_sbrk]    "sbrk",
[SYS_sleep]   "sleep",
[SYS_uptime]  "uptime",
[SYS_open]    "open",
[SYS_write]   "write",
[SYS_mknod]   "mknod",
[SYS_unlink]  "unlink",
[SYS_link]    "link",
[SYS_mkdir]   "mkdir",
[SYS_close]   "close",
[SYS_trace]   "trace",
};
```

## sysinfo

* 在*kernel/kalloc.c*中添加一个函数用于获取空闲内存量

```c
struct run {
  struct run *next;
};

struct {
  struct spinlock lock;
  struct run *freelist;
} kmem;
```

内存是使用链表进行管理的，因此遍历`kmem`中的空闲链表就能够获取所有的空闲内存，如下

```c
void
freebytes(uint64 *dst)
{
  *dst = 0;
  struct run *p = kmem.freelist; // 用于遍历

  acquire(&kmem.lock);
  while (p) {
    *dst += PGSIZE;
    p = p->next;
  }
  release(&kmem.lock);
}
```

* 在*kernel/proc.c*中添加一个函数获取进程数

遍历`proc`数组，统计处于活动状态的进程即可，循环的写法参考`scheduler`函数

```c
void
procnum(uint64 *dst)
{
  *dst = 0;
  struct proc *p;
  for (p = proc; p < &proc[NPROC]; p++) {
    if (p->state != UNUSED)
      (*dst)++;
  }
}
```

* 实现`sys_sysinfo`，将数据写入结构体并传递到用户空间

```c
uint64
sys_sysinfo(void)
{
  struct sysinfo info;
  freebytes(&info.freemem);
  procnum(&info.nproc);

  // 获取虚拟地址
  uint64 dstaddr;
  argaddr(0, &dstaddr);

  // 从内核空间拷贝数据到用户空间
  if (copyout(myproc()->pagetable, dstaddr, (char *)&info, sizeof info) < 0)
    return -1;

  return 0;
}
```
