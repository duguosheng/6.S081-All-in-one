# 8.16 练习

1. 为什么要在`balloc`中`panic`？xv6可以恢复吗？
2. 为什么要在`ialloc`中`panic`？xv6可以恢复吗？
3. 当文件用完时，`filealloc`为什么不`panic`？为什么这更常见，因此值得处理？
4. 假设在`sys_link`调用`iunlock(ip)`和`dirlink`之间，与`ip`对应的文件被另一个进程解除链接。链接是否正确创建？为什么？
5. `create`需要四个函数调用都成功（一次调用`ialloc`，三次调用`dirlink`）。如果未成功，`create`调用`panic`。为什么这是可以接受的？为什么这四个调用都不能失败？
6. `sys_chdir`在`iput(cp->cwd)`之前调用`iunlock(ip)`，这可能会尝试锁定`cp->cwd`，但将`iunlock(ip)`延迟到`iput`之后不会导致死锁。为什么不这样做？
7. 实现`lseek`系统调用。支持`lseek`还需要修改`filewrite`，以便在`lseek`设置`off`超过`f->ip->size`时，用零填充文件中的空缺。
8. 将`O_TRUNC`和`O_APPEND`添加到`open`，以便`>`和`>>`操作符在shell中工作。
9. 修改文件系统以支持符号链接。
10. 修改文件系统以支持命名管道。
11. 修改文件和VM系统以支持内存映射文件。