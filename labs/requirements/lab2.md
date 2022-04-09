# Lab2: system calls

在上一个实验室中，您使用系统调用编写了一些实用程序。在本实验室中，您将向xv6添加一些新的系统调用，这将帮助您了解它们是如何工作的，并使您了解xv6内核的一些内部结构。您将在以后的实验室中添加更多系统调用。

> [!WARNING|label:Attention]
> 在你开始写代码之前，请阅读xv6手册《book-riscv-rev1》的第2章、第4章的第4.3节和第4.4节以及相关源代码文件：
> 
> - 系统调用的用户空间代码在***user/user.h***和***user/usys.pl***中。
> - 内核空间代码是***kernel/syscall.h***、***kernel/syscall.c***。
> - 与进程相关的代码是***kernel/proc.h***和***kernel/proc.c***。

要开始本章实验，请将代码切换到**syscall**分支：

```bash
$ git fetch
$ git checkout syscall
$ make clean
```

如果运行`make grade`，您将看到测试分数的脚本无法执行`trace`和`sysinfotest`。您的工作是添加必要的系统调用和存根（stubs）以使它们工作。

# System call tracing（moderate）

> [!TIP|label:YOUR JOB]
> 在本作业中，您将添加一个系统调用跟踪功能，该功能可能会在以后调试实验时对您有所帮助。您将创建一个新的`trace`系统调用来控制跟踪。它应该有一个参数，这个参数是一个整数“掩码”（mask），它的比特位指定要跟踪的系统调用。例如，要跟踪`fork`系统调用，程序调用`trace(1 << SYS_fork)`，其中`SYS_fork`是***kernel/syscall.h***中的系统调用编号。如果在掩码中设置了系统调用的编号，则必须修改xv6内核，以便在每个系统调用即将返回时打印出一行。该行应该包含进程id、系统调用的名称和返回值；您不需要打印系统调用参数。`trace`系统调用应启用对调用它的进程及其随后派生的任何子进程的跟踪，但不应影响其他进程。

我们提供了一个用户级程序版本的`trace`，它运行另一个启用了跟踪的程序（参见***user/trace.c***）。完成后，您应该看到如下输出：

```bash
$ trace 32 grep hello README
3: syscall read -> 1023
3: syscall read -> 966
3: syscall read -> 70
3: syscall read -> 0
$
$ trace 2147483647 grep hello README
4: syscall trace -> 0
4: syscall exec -> 3
4: syscall open -> 3
4: syscall read -> 1023
4: syscall read -> 966
4: syscall read -> 70
4: syscall read -> 0
4: syscall close -> 0
$
$ grep hello README
$
$ trace 2 usertests forkforkfork
usertests starting
test forkforkfork: 407: syscall fork -> 408
408: syscall fork -> 409
409: syscall fork -> 410
410: syscall fork -> 411
409: syscall fork -> 412
410: syscall fork -> 413
409: syscall fork -> 414
411: syscall fork -> 415
...
$   
```

在上面的第一个例子中，`trace`调用`grep`，仅跟踪了`read`系统调用。`32`是`1<<SYS_read`。在第二个示例中，`trace`在运行`grep`时跟踪所有系统调用；`2147483647`将所有31个低位置为1。在第三个示例中，程序没有被跟踪，因此没有打印跟踪输出。在第四个示例中，在`usertests`中测试的`forkforkfork`中所有子孙进程的`fork`系统调用都被追踪。如果程序的行为如上所示，则解决方案是正确的（尽管进程ID可能不同）

**提示：**

-  在***Makefile***的**UPROGS**中添加`$U/_trace`
- 运行`make qemu`，您将看到编译器无法编译***user/trace.c***，因为系统调用的用户空间存根还不存在：将系统调用的原型添加到***user/user.h***，存根添加到***user/usys.pl***，以及将系统调用编号添加到***kernel/syscall.h***，***Makefile***调用perl脚本***user/usys.pl***，它生成实际的系统调用存根***user/usys.S***，这个文件中的汇编代码使用RISC-V的`ecall`指令转换到内核。一旦修复了编译问题（*注：如果编译还未通过，尝试先`make clean`，再执行`make qemu`*），就运行`trace 32 grep hello README`；但由于您还没有在内核中实现系统调用，执行将失败。
- 在***kernel/sysproc.c***中添加一个`sys_trace()`函数，它通过将参数保存到`proc`结构体（请参见***kernel/proc.h***）里的一个新变量中来实现新的系统调用。从用户空间检索系统调用参数的函数在***kernel/syscall.c***中，您可以在***kernel/sysproc.c***中看到它们的使用示例。
- 修改`fork()`（请参阅***kernel/proc.c***）将跟踪掩码从父进程复制到子进程。
- 修改***kernel/syscall.c***中的`syscall()`函数以打印跟踪输出。您将需要添加一个系统调用名称数组以建立索引。



# Sysinfo（moderate）

> [!TIP|label:YOUR JOB]
> 在这个作业中，您将添加一个系统调用`sysinfo`，它收集有关正在运行的系统的信息。系统调用采用一个参数：一个指向`struct sysinfo`的指针（参见***kernel/sysinfo.h***）。内核应该填写这个结构的字段：`freemem`字段应该设置为空闲内存的字节数，`nproc`字段应该设置为`state`字段不为`UNUSED`的进程数。我们提供了一个测试程序`sysinfotest`；如果输出“**sysinfotest: OK**”则通过。

**提示：**

- 在***Makefile***的**UPROGS**中添加`$U/_sysinfotest`
- 当运行`make qemu`时，***user/sysinfotest.c***将会编译失败，遵循和上一个作业一样的步骤添加`sysinfo`系统调用。要在***user/user.h***中声明`sysinfo()`的原型，需要预先声明`struct sysinfo`的存在：

```c
struct sysinfo;
int sysinfo(struct sysinfo *);
```

一旦修复了编译问题，就运行`sysinfotest`；但由于您还没有在内核中实现系统调用，执行将失败。

- `sysinfo`需要将一个`struct sysinfo`复制回用户空间；请参阅`sys_fstat()`(***kernel/sysfile.c***)和`filestat()`(***kernel/file.c***)以获取如何使用`copyout()`执行此操作的示例。
- 要获取空闲内存量，请在***kernel/kalloc.c***中添加一个函数
- 要获取进程数，请在***kernel/proc.c***中添加一个函数



# 可选的挑战

- 打印所跟踪的系统调用的参数（easy）。
- 计算平均负载并通过`sysinfo`导出（moderate）。