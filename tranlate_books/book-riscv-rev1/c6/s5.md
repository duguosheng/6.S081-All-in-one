# 6.5 锁和中断处理函数

一些xv6自旋锁保护线程和中断处理程序共用的数据。例如，`clockintr`定时器中断处理程序在增加`ticks`(***kernel/trap.c***:163)的同时内核线程可能在`sys_sleep `(***kernel/sysproc.c***:64)中读取`ticks`。锁`tickslock`串行化这两个访问。

自旋锁和中断的交互引发了潜在的危险。假设`sys_sleep`持有`tickslock`，并且它的CPU被计时器中断中断。`clockintr`会尝试获取`tickslock`，意识到它被持有后等待释放。在这种情况下，`tickslock`永远不会被释放：只有`sys_sleep`可以释放它，但是`sys_sleep`直到`clockintr`返回前不能继续运行。所以CPU会死锁，任何需要锁的代码也会冻结。

为了避免这种情况，如果一个自旋锁被中断处理程序所使用，那么CPU必须保证在启用中断的情况下永远不能持有该锁。Xv6更保守：当CPU获取任何锁时，xv6总是禁用该CPU上的中断。中断仍然可能发生在其他CPU上，此时中断的`acquire`可以等待线程释放自旋锁；由于不在同一CPU上，不会造成死锁。

当CPU未持有自旋锁时，xv6重新启用中断；它必须做一些记录来处理嵌套的临界区域。`acquire`调用`push_off` (***kernel/spinlock.c***:89) 并且`release`调用`pop_off` (***kernel/spinlock.c***:100)来跟踪当前CPU上锁的嵌套级别。当计数达到零时，`pop_off`恢复最外层临界区域开始时存在的中断使能状态。`intr_off`和`intr_on`函数执行RISC-V指令分别用来禁用和启用中断。

严格的在设置`lk->locked` (***kernel/spinlock.c***:28)之前让`acquire`调用`push_off`是很重要的。如果两者颠倒，会存在一个既持有锁又启用了中断的短暂窗口期，不幸的话定时器中断会使系统死锁。同样，只有在释放锁之后，`release`才调用`pop_off`也是很重要的(***kernel/spinlock.c***:66)。