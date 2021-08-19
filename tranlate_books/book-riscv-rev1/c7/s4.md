# 7.4 代码：mycpu和myproc

Xv6通常需要指向当前进程的`proc`结构体的指针。在单处理器系统上，可以有一个指向当前`proc`的全局变量。但这不能用于多核系统，因为每个核执行的进程不同。解决这个问题的方法是基于每个核心都有自己的寄存器集，从而使用其中一个寄存器来帮助查找每个核心的信息。

Xv6为每个CPU维护一个`struct cpu`，它记录当前在该CPU上运行的进程（如果有的话），为CPU的调度线程保存寄存器，以及管理中断禁用所需的嵌套自旋锁的计数。函数`mycpu` (***kernel/proc.c***:60)返回一个指向当前CPU的`struct cpu`的指针。RISC-V给它的CPU编号，给每个CPU一个`hartid`。Xv6确保每个CPU的`hartid`在内核中存储在该CPU的`tp`寄存器中。这允许`mycpu`使用`tp`对一个cpu结构体数组（即`cpus`数组，***kernel/proc.c***:9）进行索引，以找到正确的那个。

确保CPU的`tp`始终保存CPU的`hartid`有点麻烦。`mstart`在CPU启动次序的早期设置`tp`寄存器，此时仍处于机器模式（***kernel/start.c***:46）。因为用户进程可能会修改`tp`，`usertrapret`在蹦床页面（trampoline page）中保存`tp`。最后，`uservec`在从用户空间（***kernel/trampoline.S***:70）进入内核时恢复保存的`tp`。编译器保证永远不会使用`tp`寄存器。如果RISC-V允许xv6`直接读取当前hartid会更方便，`但这只允许在机器模式下，而不允许在管理模式下。

`cpuid`和`mycpu`的返回值很脆弱：如果定时器中断并导致线程让步（yield），然后移动到另一个CPU，以前返回的值将不再正确。为了避免这个问题，xv6要求调用者禁用中断，并且只有在使用完返回的`struct cpu`后才重新启用。

函数`myproc` (***kernel/proc.c***:68)返回当前CPU上运行进程`struct proc`的指针。`myproc`禁用中断，调用`mycpu`，从`struct cpu`中取出当前进程指针（`c->proc`），然后启用中断。即使启用中断，`myproc`的返回值也可以安全使用：如果计时器中断将调用进程移动到另一个CPU，其`struct proc`指针不会改变。