# 8.14 代码：系统调用

通过使用底层提供的函数，大多数系统调用的实现都很简单（请参阅***kernel/sysfile.c***）。有几个调用值得仔细看看。

函数`sys_link`和`sys_unlink`编辑目录，创建或删除索引节点的引用。它们是使用事务能力的另一个很好的例子。`sys_link`（***kernel/sysfile.c***:120）从获取其参数开始，两个字符串分别是`old`和`new`（***kernel/sysfile.c***:125）。假设`old`存在并且不是一个目录（***kernel/sysfile.c***:129-132），`sys_link`会增加其`ip->nlink`计数。然后`sys_link`调用`nameiparent`来查找`new`（***kernel/sysfile.c***:145）的父目录和最终路径元素，并创建一个指向`old`的inode（***kernel/sysfile.c***:148）的新目录条目。`new`的父目录必须存在并且与现有inode位于同一设备上：inode编号在一个磁盘上只有唯一的含义。如果出现这样的错误，`sys_link`必须返回并减少`ip->nlink`。

事务简化了实现，因为它需要更新多个磁盘块，但我们不必担心更新的顺序。他们要么全部成功，要么什么都不做。例如在没有事务的情况下，在创建一个链接之前更新`ip->nlink`会使文件系统暂时处于不安全状态，而在这两者之间发生的崩溃可能会造成严重破坏。对于事务，我们不必担心这一点

`Sys_link`为现有inode创建一个新名称。函数`create`（***kernel/sysfile.c***:242）为新inode创建一个新名称。它是三个文件创建系统调用的泛化：带有`O_CREATE`标志的`open`生成一个新的普通文件，`mkdir`生成一个新目录，`mkdev`生成一个新的设备文件。与`sys_link`一样，`create`从调用`nameiparent`开始，以获取父目录的inode。然后调用`dirlookup`检查名称是否已经存在（***kernel/sysfile.c***:252）。如果名称确实存在，`create`的行为取决于它用于哪个系统调用：`open`的语义与`mkdir`和`mkdev`不同。如果`create`是代表`open`（`type == T_FILE`）使用的，并且存在的名称本身是一个常规文件，那么`open`会将其视为成功，`create`也会这样做（***kernel/sysfile.c***:256）。否则，这是一个错误（***kernel/sysfile.c***:257-258）。如果名称不存在，`create`现在将使用`ialloc`（***kernel/sysfile.c***:261）分配一个新的inode。如果新inode是目录，`create`将使用`.`和`..`条目对它进行初始化。最后，既然数据已正确初始化，`create`可以将其链接到父目录（***kernel/sysfile.c***:274）。`Create`与`sys_link`一样，同时持有两个inode锁：`ip`和`dp`。不存在死锁的可能性，因为索引结点`ip`是新分配的：系统中没有其他进程会持有`ip`的锁，然后尝试锁定`dp`。

使用`create`，很容易实现`sys_open`、`sys_mkdir`和`sys_mknod`。`Sys_open`（***kernel/sysfile.c***:287）是最复杂的，因为创建一个新文件只是它能做的一小部分。如果`open`被传递了`O_CREATE`标志，它将调用`create`（***kernel/sysfile.c***:301）。否则，它将调用`namei`（***kernel/sysfile.c***:307）。`Create`返回一个锁定的inode，但`namei`不锁定，因此`sys_open`必须锁定inode本身。这提供了一个方便的地方来检查目录是否仅为读取打开，而不是写入。假设inode是以某种方式获得的，`sys_open`分配一个文件和一个文件描述符（***kernel/sysfile.c***:325），然后填充该文件（***kernel/sysfile.c***:337-342）。请注意，没有其他进程可以访问部分初始化的文件，因为它仅位于当前进程的表中。

在我们还没有文件系统之前，第7章就研究了管道的实现。函数`sys_pipe`通过提供创建管道对的方法将该实现连接到文件系统。它的参数是一个指向两个整数的指针，它将在其中记录两个新的文件描述符。然后分配管道并安装文件描述符。