# Lab5: xv6 lazy page allocation

操作系统可以使用页表硬件的技巧之一是延迟分配用户空间堆内存（lazy allocation of user-space heap memory）。Xv6应用程序使用`sbrk()`系统调用向内核请求堆内存。在我们给出的内核中，`sbrk()`分配物理内存并将其映射到进程的虚拟地址空间。内核为一个大请求分配和映射内存可能需要很长时间。例如，考虑由262144个4096字节的页组成的千兆字节；即使单独一个页面的分配开销很低，但合起来如此大的分配数量将不可忽视。此外，有些程序申请分配的内存比实际使用的要多（例如，实现稀疏数组），或者为了以后的不时之需而分配内存。为了让`sbrk()`在这些情况下更快地完成，复杂的内核会延迟分配用户内存。也就是说，`sbrk()`不分配物理内存，只是记住分配了哪些用户地址，并在用户页表中将这些地址标记为无效。当进程第一次尝试使用延迟分配中给定的页面时，CPU生成一个页面错误（page fault），内核通过分配物理内存、置零并添加映射来处理该错误。您将在这个实验室中向xv6添加这个延迟分配特性。

> [!WARNING|label:Attention]
> 在开始编码之前，请阅读xv6手册的第4章（特别是4.6），以及可能要修改的相关文件：
> - ***kernel/trap.c***
> - ***kernel/vm.c***
> - ***kernel/sysproc.c***

要启动实验，请切换到`lazy`分支：

```bash
$ git fetch
$ git checkout lazy
$ make clean
```



# Eliminate allocation from sbrk() (easy)

> [!TIP|label:YOUR JOB]
> 你的首项任务是删除`sbrk(n)`系统调用中的页面分配代码（位于***sysproc.c***中的函数`sys_sbrk()`）。`sbrk(n)`系统调用将进程的内存大小增加n个字节，然后返回新分配区域的开始部分（即旧的大小）。新的`sbrk(n)`应该只将进程的大小（`myproc()->sz`）增加n，然后返回旧的大小。它不应该分配内存——因此您应该删除对`growproc()`的调用（但是您仍然需要增加进程的大小！）。

试着猜猜这个修改的结果是什么：将会破坏什么？

进行此修改，启动xv6，并在shell中键入`echo hi`。你应该看到这样的输出：

```bash
init: starting sh
$ echo hi
usertrap(): unexpected scause 0x000000000000000f pid=3
            sepc=0x0000000000001258 stval=0x0000000000004008
va=0x0000000000004000 pte=0x0000000000000000
panic: uvmunmap: not mapped
```

“`usertrap(): …`”这条消息来自***trap.c***中的用户陷阱处理程序；它捕获了一个不知道如何处理的异常。请确保您了解发生此页面错误的原因。“`stval=0x0..04008`”表示导致页面错误的虚拟地址是`0x4008`。



# Lazy allocation (moderate)

> [!TIP|label:YOUR JOB]
> 修改***trap.c***中的代码以响应来自用户空间的页面错误，方法是新分配一个物理页面并映射到发生错误的地址，然后返回到用户空间，让进程继续执行。您应该在生成“`usertrap(): …`”消息的`printf`调用之前添加代码。你可以修改任何其他xv6内核代码，以使`echo hi`正常工作。

**提示：**

- 你可以在`usertrap()`中查看`r_scause()`的返回值是否为13或15来判断该错误是否为页面错误
- `stval`寄存器中保存了造成页面错误的虚拟地址，你可以通过`r_stval()`读取
- 参考***vm.c***中的`uvmalloc()`中的代码，那是一个`sbrk()`通过`growproc()`调用的函数。你将需要对`kalloc()`和`mappages()`进行调用
- 使用`PGROUNDDOWN(va)`将出错的虚拟地址向下舍入到页面边界
- 当前`uvmunmap()`会导致系统`panic`崩溃；请修改程序保证正常运行
- 如果内核崩溃，请在***kernel/kernel.asm***中查看`sepc`
- 使用pgtbl lab的`vmprint`函数打印页表的内容
- 如果您看到错误“incomplete type proc”，请include“spinlock.h”然后是“proc.h”。

如果一切正常，你的lazy allocation应该使`echo hi`正常运行。您应该至少有一个页面错误（因为延迟分配），也许有两个。



# Lazytests and Usertests (moderate)

我们为您提供了`lazytests`，这是一个xv6用户程序，它测试一些可能会给您的惰性内存分配器带来压力的特定情况。修改内核代码，使所有`lazytests`和`usertests`都通过。

- 处理`sbrk()`参数为负的情况。
- 如果某个进程在高于`sbrk()`分配的任何虚拟内存地址上出现页错误，则终止该进程。
- 在`fork()`中正确处理父到子内存拷贝。
- 处理这种情形：进程从`sbrk()`向系统调用（如`read`或`write`）传递有效地址，但尚未分配该地址的内存。
- 正确处理内存不足：如果在页面错误处理程序中执行`kalloc()`失败，则终止当前进程。
- 处理用户栈下面的无效页面上发生的错误。

如果内核通过`lazytests`和`usertests`，那么您的解决方案是可以接受的：

```bash
$ lazytests
lazytests starting
running test lazy alloc
test lazy alloc: OK
running test lazy unmap...
usertrap(): ...
test lazy unmap: OK
running test out of memory
usertrap(): ...
test out of memory: OK
ALL TESTS PASSED
$ usertests
...
ALL TESTS PASSED
$
```



# 可选的挑战练习

- 让延时分配协同上一个实验中简化版的`copyin`一起工作。