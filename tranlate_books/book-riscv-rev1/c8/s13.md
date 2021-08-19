# 8.13 文件描述符层

Unix界面的一个很酷的方面是，Unix中的大多数资源都表示为文件，包括控制台、管道等设备，当然还有真实文件。文件描述符层是实现这种一致性的层。

正如我们在第1章中看到的，Xv6为每个进程提供了自己的打开文件表或文件描述符。每个打开的文件都由一个`struct file`（***kernel/file.h***:1）表示，它是inode或管道的封装，加上一个I/O偏移量。每次调用`open`都会创建一个新的打开文件（一个新的`struct file`）：如果多个进程独立地打开同一个文件，那么不同的实例将具有不同的I/O偏移量。另一方面，单个打开的文件（同一个`struct file`）可以多次出现在一个进程的文件表中，也可以出现在多个进程的文件表中。如果一个进程使用`open`打开文件，然后使用`dup`创建别名，或使用`fork`与子进程共享，就会发生这种情况。引用计数跟踪对特定打开文件的引用数。可以打开文件进行读取或写入，也可以同时进行读取和写入。`readable`和`writable`字段可跟踪此操作。

系统中所有打开的文件都保存在全局文件表`ftable`中。文件表具有分配文件（`filealloc`）、创建重复引用（`filedup`）、释放引用（`fileclose`）以及读取和写入数据（`fileread`和`filewrite`）的函数。

前三个函数遵循现在熟悉的形式。`Filealloc`（***kernel/file.c***:30）扫描文件表以查找未引用的文件（`f->ref == 0`），并返回一个新的引用；`filedup`（***kernel/file.c***:48）增加引用计数；`fileclose`（***kernel/file.c***:60）将其递减。当文件的引用计数达到零时，`fileclose`会根据`type`释放底层管道或inode。

函数`filestat`、`fileread`和`filewrite`实现对文件的`stat`、`read`和`write`操作。`Filestat`（***kernel/file.c***:88）只允许在inode上操作并且调用了`stati`。`Fileread`和`filewrite`检查打开模式是否允许该操作，然后将调用传递给管道或inode的实现。如果文件表示inode，`fileread`和`filewrite`使用I/O偏移量作为操作的偏移量，然后将文件指针前进该偏移量（***kernel/file.c***:122-123）（***kernel/file.c***:153-154）。管道没有偏移的概念。回想一下，inode的函数要求调用方处理锁（***kernel/file.c***:94-96）（***kernel/file.c***:121-124）（***kernel/file.c***:163-166）。inode锁定有一个方便的副作用，即读取和写入偏移量以原子方式更新，因此，对同一文件的同时多次写入不能覆盖彼此的数据，尽管他们的写入最终可能是交错的。