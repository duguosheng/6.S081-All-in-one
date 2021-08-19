# 4.3 代码：调用系统调用

第2章以***initcode.S***调用`exec`系统调用（***user/initcode.S***:11）结束。让我们看看用户调用是如何在内核中实现`exec`系统调用的。

用户代码将`exec`需要的参数放在寄存器`a0`和`a1`中，并将系统调用号放在`a7`中。系统调用号与`syscalls`数组中的条目相匹配，`syscalls`数组是一个函数指针表（***kernel/syscall.c***:108）。`ecall`指令陷入(trap)到内核中，执行`uservec`、`usertrap`和`syscall`，和我们之前看到的一样。

`syscall`（***kernel/syscall.c***:133）从陷阱帧（trapframe）中保存的`a7`中检索系统调用号（`p->trapframe->a7`），并用它索引到`syscalls`中，对于第一次系统调用，`a7`中的内容是`SYS_exec`（***kernel/syscall. h***:8），导致了对系统调用接口函数`sys_exec`的调用。

当系统调用接口函数返回时，`syscall`将其返回值记录在`p->trapframe->a0`中。这将导致原始用户空间对`exec()`的调用返回该值，因为RISC-V上的C调用约定将返回值放在`a0`中。系统调用通常返回负数表示错误，返回零或正数表示成功。如果系统调用号无效，`syscall`打印错误并返回-1。