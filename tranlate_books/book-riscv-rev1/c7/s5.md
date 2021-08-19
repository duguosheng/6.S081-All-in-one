# 7.5 sleep与wakeup

调度和锁有助于隐藏一个进程对另一个进程的存在，但到目前为止，我们还没有帮助进程进行有意交互的抽象。为解决这个问题已经发明了许多机制。Xv6使用了一种称为`sleep`和`wakeup`的方法，它允许一个进程在等待事件时休眠，而另一个进程在事件发生后将其唤醒。睡眠和唤醒通常被称为序列协调（sequence coordination）或条件同步机制（conditional synchronization mechanisms）。

为了说明，让我们考虑一个称为信号量（semaphore）的同步机制，它可以协调生产者和消费者。信号量维护一个计数并提供两个操作。“V”操作（对于生产者）增加计数。“P”操作（对于使用者）等待计数为非零，然后递减并返回。如果只有一个生产者线程和一个消费者线程，并且它们在不同的CPU上执行，并且编译器没有进行过积极的优化，那么此实现将是正确的：

```c
struct semaphore {
    struct spinlock lock;
    int count;
};

void V(struct semaphore* s) {
    acquire(&s->lock);
    s->count += 1;
    release(&s->lock);
}

void P(struct semaphore* s) {
    while (s->count == 0)
        ;
    acquire(&s->lock);
    s->count -= 1;
    release(&s->lock);
}
```

上面的实现代价昂贵。如果生产者很少采取行动，消费者将把大部分时间花在`while`循环中，希望得到非零计数。消费者的CPU可以找到比通过反复轮询`s->count`繁忙等待更有成效的工作。要避免繁忙等待，消费者需要一种方法来释放CPU，并且只有在`V`增加计数后才能恢复。

这是朝着这个方向迈出的一步，尽管我们将看到这是不够的。让我们想象一对调用，`sleep`和`wakeup`，工作流程如下。`Sleep(chan)`在任意值`chan`上睡眠，称为等待通道（wait channel）。`Sleep`将调用进程置于睡眠状态，释放CPU用于其他工作。`Wakeup(chan)`唤醒所有在`chan`上睡眠的进程（如果有），使其`sleep`调用返回。如果没有进程在`chan`上等待，则`wakeup`不执行任何操作。我们可以将信号量实现更改为使用`sleep`和`wakeup`（更改的行添加了注释）：

```c
void V(struct semaphore* s) {
    acquire(&s->lock);
    s->count += 1;
    wakeup(s);  // !pay attention
    release(&s->lock);
}

void P(struct semaphore* s) {
    while (s->count == 0)
        sleep(s);  // !pay attention
    acquire(&s->lock);
    s->count -= 1;
    release(&s->lock);
}
```

`P`现在放弃CPU而不是自旋，这很好。然而，事实证明，使用此接口设计`sleep`和`wakeup`而不遭受所谓的丢失唤醒（lost wake-up）问题并非易事。假设`P`在第9行发现`s->count==0`。当`P`在第9行和第10行之间时，`V`在另一个CPU上运行：它将`s->count`更改为非零，并调用`wakeup`，这样就不会发现进程处于休眠状态，因此不会执行任何操作。现在P继续在第10行执行：它调用`sleep`并进入睡眠。这会导致一个问题：`P`正在休眠，等待调用`V`，而`V`已经被调用。除非我们运气好，生产者再次呼叫`V`，否则消费者将永远等待，即使`count`为非零。

这个问题的根源是`V`在错误的时刻运行，违反了`P`仅在`s->count==0`时才休眠的不变量。保护不变量的一种不正确的方法是将锁的获取（下面以黄色突出显示）移动到`P`中，以便其检查`count`和调用`sleep`是原子的：

```c
void V(struct semaphore* s) {
    acquire(&s->lock);
    s->count += 1;
    wakeup(s);
    release(&s->lock);
}

void P(struct semaphore* s) {
    acquire(&s->lock);  // !pay attention
    while (s->count == 0)
        sleep(s);
    s->count -= 1;
    release(&s->lock);
}
```

人们可能希望这个版本的`P`能够避免丢失唤醒，因为锁阻止`V`在第10行和第11行之间执行。它确实这样做了，但它会导致死锁：`P`在睡眠时持有锁，因此`V`将永远阻塞等待锁。

我们将通过更改`sleep`的接口来修复前面的方案：调用方必须将条件锁（condition lock）传递给sleep，以便在调用进程被标记为asleep并在睡眠通道上等待后`sleep`可以释放锁。如果有一个并发的`V`操作，锁将强制它在`P`将自己置于睡眠状态前一直等待，因此`wakeup`将找到睡眠的消费者并将其唤醒。一旦消费者再次醒来，`sleep`会在返回前重新获得锁。我们新的正确的`sleep/wakeup`方案可用如下（更改以黄色突出显示）：

```c
void V(struct semaphore* s) {
    acquire(&s->lock);
    s->count += 1;
    wakeup(s);
    release(&s->lock);
}

void P(struct semaphore* s) {
    acquire(&s->lock);

    while (s->count == 0)
        sleep(s, &s->lock);  // !pay attention
    s->count -= 1;
    release(&s->lock);
}
```

`P`持有`s->lock`的事实阻止`V`在`P`检查`s->count`和调用`sleep`之间试图唤醒它。然而请注意，我们需要`sleep`释放`s->lock`并使消费者进程进入睡眠状态的操作是原子的。