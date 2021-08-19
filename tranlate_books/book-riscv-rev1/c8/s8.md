# 8.8 索引结点层

术语inode（即索引结点）可以具有两种相关含义之一。它可能是指包含文件大小和数据块编号列表的磁盘上的数据结构。或者“inode”可能指内存中的inode，它包含磁盘上inode的副本以及内核中所需的额外信息。

磁盘上的inode都被打包到一个称为inode块的连续磁盘区域中。每个inode的大小都相同，因此在给定数字n的情况下，很容易在磁盘上找到第n个inode。事实上，这个编号n，称为inode number或i-number，是在具体实现中标识inode的方式。

磁盘上的inode由`struct dinode`（***kernel/fs.h***:32）定义。字段`type`区分文件、目录和特殊文件（设备）。`type`为零表示磁盘inode是空闲的。字段`nlink`统计引用此inode的目录条目数，以便识别何时应释放磁盘上的inode及其数据块。字段`size`记录文件中内容的字节数。`addrs`数组记录保存文件内容的磁盘块的块号。

内核将活动的inode集合保存在内存中；`struct inode`（***kernel/file.h***:17）是磁盘上`struct dinode`的内存副本。只有当有C指针引用某个inode时，内核才会在内存中存储该inode。`ref`字段统计引用内存中inode的C指针的数量，如果引用计数降至零，内核将从内存中丢弃该inode。`iget`和`iput`函数分别获取和释放指向inode的指针，修改引用计数。指向inode的指针可以来自文件描述符、当前工作目录和如`exec`的瞬态内核代码。

xv6的inode代码中有四种锁或类似锁的机制。`icache.lock`保护以下两个不变量：inode最多在缓存中出现一次；缓存inode的`ref`字段记录指向缓存inode的内存指针数量。每个内存中的inode都有一个包含睡眠锁的`lock`字段，它确保以独占方式访问inode的字段（如文件长度）以及inode的文件或目录内容块。如果inode的`ref`大于零，则会导致系统在cache中维护inode，而不会对其他inode重用此缓存项。最后，每个inode都包含一个`nlink`字段（在磁盘上，如果已缓存则复制到内存中），该字段统计引用文件的目录项的数量；如果inode的链接计数大于零，xv6将不会释放inode。

`iget()`返回的`struct inode`指针在相应的`iput()`调用之前保证有效：inode不会被删除，指针引用的内存也不会被其他inode重用。`iget()`提供对inode的非独占访问，因此可以有许多指向同一inode的指针。文件系统代码的许多部分都依赖于`iget()`的这种行为，既可以保存对inode的长期引用（如打开的文件和当前目录），也可以防止争用，同时避免操纵多个inode（如路径名查找）的代码产生死锁。

`iget`返回的`struct inode`可能没有任何有用的内容。为了确保它保存磁盘inode的副本，代码必须调用`ilock`。这将锁定inode（以便没有其他进程可以对其进行`ilock`），并从磁盘读取尚未读取的inode。`iunlock`释放inode上的锁。将inode指针的获取与锁定分离有助于在某些情况下避免死锁，例如在目录查找期间。多个进程可以持有指向`iget`返回的inode的C指针，但一次只能有一个进程锁定inode。

inode缓存只缓存内核代码或数据结构持有C指针的inode。它的主要工作实际上是同步多个进程的访问；缓存是次要的。如果经常使用inode，在inode缓存不保留它的情况下buffer cache可能会将其保留在内存中。inode缓存是直写的，这意味着修改已缓存inode的代码必须立即使用`iupdate`将其写入磁盘。