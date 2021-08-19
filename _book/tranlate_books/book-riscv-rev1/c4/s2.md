# 4.2 从用户空间陷入

如果用户程序发出系统调用（`ecall`指令），或者做了一些非法的事情，或者设备中断，那么在用户空间中执行时就可能会产生陷阱。来自用户空间的陷阱的高级路径是`uservec` (***kernel/trampoline.S***:16)，然后是`usertrap` (***kernel/trap.c***:37)；返回时，先是`usertrapret` (***kernel/trap.c***:90)，然后是`userret` (***kernel/trampoline.S***:16)。

来自用户代码的陷阱比来自内核的陷阱更具挑战性，因为`satp`指向不映射内核的用户页表，栈指针可能包含无效甚至恶意的值。

由于RISC-V硬件在陷阱期间不会切换页表，所以用户页表必须包括`uservec`（**stvec**指向的陷阱向量指令）的映射。`uservec`必须切换`satp`以指向内核页表；为了在切换后继续执行指令，`uservec`必须在内核页表中与用户页表中映射相同的地址。

xv6使用包含`uservec`的蹦床页面（trampoline page）来满足这些约束。xv6将蹦床页面映射到内核页表和每个用户页表中相同的虚拟地址。这个虚拟地址是`TRAMPOLINE`（如图2.3和图3.3所示）。蹦床内容在***trampoline.S***中设置，并且（当执行用户代码时）`stvec`设置为`uservec` (***kernel/trampoline.S***:16)。

当`uservec`启动时，所有32个寄存器都包含被中断代码所拥有的值。但是`uservec`需要能够修改一些寄存器，以便设置`satp`并生成保存寄存器的地址。RISC-V以`sscratch`寄存器的形式提供了帮助。`uservec`开始时的`csrrw`指令交换了`a0`和`sscratch`的内容。现在用户代码的`a0`被保存了；`uservec`有一个寄存器（`a0`）可以使用；`a0`包含内核以前放在`sscratch`中的值。

`uservec`的下一个任务是保存用户寄存器。在进入用户空间之前，内核先前将`sscratch`设置为指向一个每个进程的陷阱帧，该帧（除此之外）具有保存所有用户寄存器的空间(***kernel/proc.h***:44)。因为`satp`仍然指向用户页表，所以`uservec`需要将陷阱帧映射到用户地址空间中。每当创建一个进程时，xv6就为该进程的陷阱帧分配一个页面，并安排它始终映射在用户虚拟地址`TRAPFRAME`，该地址就在`TRAMPOLINE`下面。尽管使用物理地址，该进程的`p->trapframe`仍指向陷阱帧，这样内核就可以通过内核页表使用它。

因此在交换`a0`和`sscratch`之后，`a0`持有指向当前进程陷阱帧的指针。`uservec`现在保存那里的所有用户寄存器，包括从`sscratch`读取的用户的`a0`。

陷阱帧包含指向当前进程内核栈的指针、当前CPU的`hartid`、`usertrap`的地址和内核页表的地址。`uservec`取得这些值，将`satp`切换到内核页表，并调用`usertrap`。

`usertrap`的任务是确定陷阱的原因，处理并返回(***kernel/trap.c***:37)。如上所述，它首先改变`stvec`，这样内核中的陷阱将由`kernelvec`处理。它保存了`sepc`（保存的用户程序计数器），再次保存是因为`usertrap`中可能有一个进程切换，可能导致`sepc`被覆盖。如果陷阱来自系统调用，`syscall`会处理它；如果是设备中断，`devintr`会处理；否则它是一个异常，内核会杀死错误进程。系统调用路径在保存的用户程序计数器`pc`上加4，因为在系统调用的情况下，RISC-V会留下指向`ecall`指令的程序指针（返回后需要执行`ecall`之后的下一条指令）。在退出的过程中，`usertrap`检查进程是已经被杀死还是应该让出CPU（如果这个陷阱是计时器中断）。

返回用户空间的第一步是调用`usertrapret` (***kernel/trap.c***:90)。该函数设置RISC-V控制寄存器，为将来来自用户空间的陷阱做准备。这涉及到将`stvec`更改为指向`uservec`，准备`uservec`所依赖的陷阱帧字段，并将`sepc`设置为之前保存的用户程序计数器。最后，`usertrapret`在用户和内核页表中都映射的蹦床页面上调用`userret`；原因是`userret`中的汇编代码会切换页表。

`usertrapret`对`userret`的调用将指针传递到`a0`中的进程用户页表和`a1`中的`TRAPFRAME` (***kernel/trampoline.S***:88)。`userret`将`satp`切换到进程的用户页表。回想一下，用户页表同时映射蹦床页面和`TRAPFRAME`，但没有从内核映射其他内容。同样，蹦床页面映射在用户和内核页表中的同一个虚拟地址上的事实允许用户在更改`satp`后继续执行。`userret`复制陷阱帧保存的用户`a0`到`sscratch`，为以后与`TRAPFRAME`的交换做准备。从此刻开始，`userret`可以使用的唯一数据是寄存器内容和陷阱帧的内容。下一个`userret`从陷阱帧中恢复保存的用户寄存器，做`a0`与`sscratch`的最后一次交换来恢复用户`a0`并为下一个陷阱保存`TRAPFRAME`，并使用`sret`返回用户空间。