# 7.7 代码：Pipes

使用睡眠和唤醒来同步生产者和消费者的一个更复杂的例子是xv6的管道实现。我们在第1章中看到了管道接口：写入管道一端的字节被复制到内核缓冲区，然后可以从管道的另一端读取。以后的章节将研究围绕管道的文件描述符支持，但现在让我们看看`pipewrite`和`piperead`的实现。

每个管道都由一个`struct pipe`表示，其中包含一个锁`lock`和一个数据缓冲区`data`。字段`nread`和`nwrite`统计从缓冲区读取和写入缓冲区的总字节数。缓冲区是环形的：在`buf[PIPESIZE-1]`之后写入的下一个字节是`buf[0]`。而计数不是环形。此约定允许实现区分完整缓冲区（`nwrite==nread+PIPESIZE`）和空缓冲区（`nwrite==nread`），但这意味着对缓冲区的索引必须使用`buf[nread%PIPESIZE]`，而不仅仅是`buf[nread]`（对于`nwrite`也是如此）。

让我们假设对`piperead`和`pipewrite`的调用同时发生在两个不同的CPU上。`Pipewrite`（***kernel/pipe.c***:77）从获取管道锁开始，它保护计数、数据及其相关不变量。`Piperead`（***kernel/pipe.c***:103）然后也尝试获取锁，但无法实现。它在`acquire`（***kernel/spinlock.c***:22）中旋转等待锁。当`piperead`等待时，`pipewrite`遍历被写入的字节（`addr[0..n-1]`），依次将每个字节添加到管道中（***kernel/pipe.c***:95）。在这个循环中缓冲区可能会被填满（***kernel/pipe.c***:85）。在这种情况下，`pipewrite`调用`wakeup`来提醒所有处于睡眠状态的读进程缓冲区中有数据等待，然后在`&pi->nwrite`上睡眠，等待读进程从缓冲区中取出一些字节。作为使`pipewrite`进程进入睡眠状态的一部分，`Sleep`释放`pi->lock`。

现在`pi->lock`可用，`piperead`设法获取它并进入其临界区域：它发现`pi->nread != pi->nwrite`（***kernel/pipe.c***:110）（`pipewrite`进入睡眠状态是因为`pi->nwrite == pi->nread+PIPESIZE`（***kernel/pipe.c***:85）），因此它进入`for`循环，从管道中复制数据（***kernel/pipe.c***:117），并根据复制的字节数增加`nread`。那些读出的字节就可供写入，因此`piperead`调用`wakeup`（***kernel/pipe.c***:124）返回之前唤醒所有休眠的写进程。`Wakeup`寻找一个在`&pi->nwrite`上休眠的进程，该进程正在运行`pipewrite`，但在缓冲区填满时停止。它将该进程标记为`RUNNABLE`。

管道代码为读者和写者使用单独的睡眠通道（`pi->nread`和`pi->nwrite`）；这可能会使系统在有许多读者和写者等待同一管道这种不太可能的情况下更加高效。管道代码在检查休眠条件的循环中休眠；如果有多个读者或写者，那么除了第一个醒来的进程之外，所有进程都会看到条件仍然错误，并再次睡眠。



 