# 4.8 练习

1. 函数`copyin`和`copyinstr`在软件中遍历用户页表。设置内核页表，使内核拥有用户程序的映射，这样`copyin`和`copyinstr`可以使用`memcpy`将系统调用参数复制到内核空间，依靠硬件进行页表遍历
2. 实现惰性内存分配*(lazy allocation)*
3. 实现写时拷贝版本的`fork`（*copy on write fork*）

