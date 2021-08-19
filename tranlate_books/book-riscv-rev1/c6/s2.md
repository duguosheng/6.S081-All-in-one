# 6.2 代码：Locks

Xv6有两种类型的锁：自旋锁（spinlocks）和睡眠锁（sleep-locks）。我们将从自旋锁（注：自旋，即循环等待）开始。Xv6将自旋锁表示为`struct spinlock` (***kernel/spinlock.h***:2)。结构体中的重要字段是`locked`，当锁可用时为零，当它被持有时为非零。从逻辑上讲，xv6应该通过执行以下代码来获取锁

```c
void
acquire(struct spinlock* lk) // does not work!
{
  for(;;) {
    if(lk->locked == 0) {
      lk->locked = 1;
      break;
    }
  }
}
```

不幸的是，这种实现不能保证多处理器上的互斥。可能会发生两个CPU同时到达第5行，看到`lk->locked`为零，然后都通过执行第6行占有锁。此时就有两个不同的CPU持有锁，从而违反了互斥属性。我们需要的是一种方法，使第5行和第6行作为原子（即不可分割）步骤执行。

因为锁被广泛使用，多核处理器通常提供实现第5行和第6行的原子版本的指令。在RISC-V上，这条指令是`amoswap r, a`。`amoswap`读取内存地址`a`处的值，将寄存器`r`的内容写入该地址，并将其读取的值放入`r`中。也就是说，它交换寄存器和指定内存地址的内容。它原子地执行这个指令序列，使用特殊的硬件来防止任何其他CPU在读取和写入之间使用内存地址。

Xv6的`acquire`(***kernel/spinlock.c***:22)使用可移植的C库调用归结为`amoswap`的指令`__sync_lock_test_and_set`；返回值是`lk->locked`的旧（交换了的）内容。`acquire`函数将swap包装在一个循环中，直到它获得了锁前一直重试（自旋）。每次迭代将1与`lk->locked`进行swap操作，并检查`lk->locked`之前的值。如果之前为0，swap已经把`lk->locked`设置为1，那么我们就获得了锁；如果前一个值是1，那么另一个CPU持有锁，我们原子地将1与`lk->locked`进行swap的事实并没有改变它的值。

获取锁后，用于调试，`acquire`将记录下来获取锁的CPU。`lk->cpu`字段受锁保护，只能在保持锁时更改。

函数`release`(***kernel/spinlock.c***:47) 与`acquire`相反：它清除`lk->cpu`字段，然后释放锁。从概念上讲，`release`只需要将0分配给`lk->locked`。C标准允许编译器用多个存储指令实现赋值，因此对于并发代码，C赋值可能是非原子的。因此`release`使用执行原子赋值的C库函数`__sync_lock_release`。该函数也可以归结为RISC-V的`amoswap`指令。