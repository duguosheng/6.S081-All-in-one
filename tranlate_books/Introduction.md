# Introduction

# 课程介绍

6.S081 2020 Lecture 1: OS概述

## 概述

- 6.S081目标
  - 了解操作系统(OS)的设计和实现

- 动手扩展小型操作系统的实践经验

- 有编写系统软件的实际操作经验

- 操作系统的目的是什么?
  - 为方便和可移植性而对硬件进行抽象

- 在多种应用中实现硬件的多路复用

- 隔离应用程序，多个程序互不干扰

- 允许在合作的应用程序之间共享

- 控制共享安全

- 不要妨碍高效

- 支持广泛的应用

- 组织方式:分层结构
  - 用户应用层:vi、gcc、DB和c

- 内核服务层

- 硬件层: CPU、RAM、磁盘、网络等

我们非常关心接口和内部内核结构

- 操作系统内核通常提供什么服务?
  - 进程(一个正在运行的程序)

- 内存分配

- 文件内容

- 文件名，目录

- 访问控制(安全性)

- 其他:用户、IPC（进程间通信）、网络、时间、终端

- 什么是应用程序/内核接口?
  - “系统调用”

- 例子，在UNIX(如Linux, macOS, FreeBSD)中的C语言中:

```c
fd = open("out", 1);
write(fd, "hello\n", 6);
pid = fork();
```

- 这些看起来像函数调用，但实际上不是

- 为什么操作系统的设计和实现是困难和有趣的?
  - 恶劣的环境:古怪的硬件，很难调试

- 许多设计张力:
  - 高效vs抽象/便携/通用

- 强大的vs简单的接口

- 灵活vs安全

- 功能交互:'fd = open(); fork()`

- 用途多种多样:笔记本电脑、智能手机、云计算、虚拟机、嵌入式

- 不断发展的硬件:NVRAM、多核、高速网络

- 你会很高兴你选了这门课，如果你…
  - 关心计算机运行的背后发生了什么

- 喜欢基础架构

- 需要追踪漏洞或安全问题

- 注重高性能

## 课程结构

- 网上课程信息:

[6.S081官网](https://pdos.csail.mit.edu/6.S081/)，网站中包含了课程表，作业，实验

[Piazza](https://piazza.com/)：公告，讨论，实验帮助

- 视频课程
  - 操作系统的想法

- 通过代码和xv6的书，xv6（一个小的操作系统）的案例研究

- 实验背景

- 操作系统相关论文

- 上课前提交一个关于阅读材料的问题。

- 实验:
  - 重点是:实践经验（基本上每个星期一个实验）

- 实验的三种类型:
  - 系统编程(下周截止…)

- OS原语，例如线程切换。

- xv6的OS内核扩展，例如网络。

- 使用piazza提问/回答实验室的问题。

- 讨论很好，但请不要看别人的解决方案!

- 评分:
  - 70%的实验室，基于测试(与运行的测试相同)。

- 20%的实验室检查会议:我们会问你关于随机选择的实验室的问题。

- 10%的家庭作业和课堂/广场讨论。

- 没有考试，没有小测验。

- 请注意，大部分成绩来自实验室，请尽早开始!

## UNIX系统调用简介

- 应用程序通过系统调用查看操作系统;这种接口将是我们关注的重点。
  - 让我们从查看程序如何使用系统调用开始。

- 您将在第一个实验室中使用这些系统调用。

- 并在随后的实验室中进行扩展和改进。

- 我将展示一些示例，并在xv6上运行它们。

xv6的结构与UNIX系统(如Linux)类似。但是要简单得多——您将能够理解xv6的全部内容附带的书解释了xv6的工作原理和原因

- 为什么选择UNIX ?
  - 开源代码，有良好的文档，干净的设计，广泛使用

- 如果您需要了解Linux内部，学习xv6将有所帮助

- xv6在6.S081中有两个角色:
  - 核心函数的例子:虚拟内存，多核，中断，等等

- 大多数实验的起点

- xv6运行在RISC-V上，就像当前的6.004一样

- 您将在qemu机器仿真器下运行xv6

### 例子:`copy.c`：复制输入到输出

```c
char buf[64];

while(1){
int n = read(0, buf, sizeof(buf));
if(n &lt;= 0)
  break;
write(1, buf, n);
}

exit(0);
```

从输入中读取字节，并将其写入输出

`copy.c`是用C语言写的，克尼根和里奇(K&R)的《C程序设计语言》可以帮助你学习C语言，另外你可以通过官网上时间表中的`example`指向的链接找到这些示例程序

其中`read()`和`write()`是系统调用

- read()/write()的第一个参数是一个“文件描述符”(fd)

> 它传递给内核，告诉系统调用要读/写哪个“打开的文件”，fd必须是已经打开过的，可以指向文件/设备/套接字等等。一个进程可以打开很多文件，有很多`fd`，UNIX约定:fd 0是“标准输入”，1是“标准输出”

- 第二个read()参数是一个指向要读取的内存的指针

- 第三个参数是要读取的最大字节数

> read()可以读得更少，但不能读得更多

- 返回值:实际读取的字节数，或-1表示错误

> 注意:copy.c不关心数据的格式，UNIX I/O是8位字节，解释是特定于应用程序的，例如数据库记录，C源，等等

文件描述符来自哪里?

### 例子:`open.c`，创建一个文件

```c
// open.c: create a file, write to it.

#include "kernel/types.h"
#include "user/user.h"
#include "kernel/fcntl.h"

int
main()
{
  int fd = open("output.txt", O_WRONLY | O_CREATE);
  write(fd, "ooo\n", 4);

  exit(0);
}
```

`open()`创建文件，返回文件描述符fd(或-1表示错误)，`fd`是一个短整数，`fd`索引到内核维护的每个进程表中

不同的进程具有不同的`fd`命名空间，也就是说，文件描述符1对于不同的进程通常意味着不同的东西，然而这些例子忽略了可能的错误——但你不要这么草率!

《xv6》中的图1.2列出了系统调用的参数、返回值，或者你查看UNIX手册页，例如。`man 2 open`

- 当程序调用像open()这样的系统调用时会发生什么?



`open`看起来像一个函数调用，但实际上是一个特殊的指令

1. 硬件保存一些用户寄存器
2. 硬件增加特权级别
3. 硬件会跳转到内核中一个已知的“入口点”
4. 现在在内核中运行C代码
5. 内核调用系统调用执行
    - open()在文件系统中查找文件名
    - 它可能会等待磁盘
    - 它更新内核数据结构(缓存，FD表)
6. 恢复用户寄存器
7. 减少特权级别
8. 回到程序中的调用点，它将继续运行

我们将在后面的课程中看到更多细节

- Shell是UNIX系统上的命令行界面。

 shell会打印“$”提示符提示输入命令，它允许您运行UNIX命令行实用程序，这对系统管理、文件处理、开发、脚本编写非常有用

```bash
$ ls
$ ls > out
$ grep x < out
```

UNIX也支持其他类型的交互,例如窗口系统，图形用户界面，服务器，路由器，等等。但是，通过shell实现分时是UNIX最初的重点。我们可以通过shell执行许多系统调用。

### 例子：`fork.c`：创建一个新的过程

```c
// fork.c: create a new process

#include "kernel/types.h"
#include "user/user.h"

int
main()
{
  int pid;

  pid = fork();

  printf("fork() returned %d\n", pid);

  if(pid == 0){
    printf("child\n");
  } else {
    printf("parent\n");
  }

  exit(0);
}
```

shell会为您键入的每个命令创建一个新进程，例如，对于

```bash
$ echo hello
```

来说`fork()`系统调用创建一个新进程，内核复制调用进程的指令、数据、寄存器、文件描述符、当前目录

“父进程”和“子进程”的唯一的区别是:`fork()`在父进程中返回pid，在子进程中返回0，pid(进程ID)是一个整数，内核给每个进程一个不同的pid

因此:`fork.c`的`printf("fork() returned %d\n", pid);`会在父子两个进程中执行

“`if(pid == 0)`”允许代码进行区分父子进程

fork让我们创建一个新进程，那么我们如何在这个进程中运行一个程序呢?

### 例子:`exec.c`：用可执行文件替换调用进程

```c
// exec.c: replace a process with an executable file

#include "kernel/types.h"
#include "user/user.h"

int
main()
{
  char *argv[] = { "echo", "this", "is", "echo", 0 };

  exec("echo", argv);

  printf("exec failed!\n");

  exit(0);
}
```

shell是如何运行程序的?例如

```bash
$ echo a b c
```

程序存储在一个文件中，指令和初始内存由编译器和链接器创建

有一个叫echo的文件，包含指令

```bash
$ echo
```

`echo.c`文件内容如下

```c
#include "kernel/types.h"
#include "user/user.h"

int
main(int argc, char *argv[])
{
  int i;

  for(i = 1; i &lt; argc; i++){
    write(1, argv[i], strlen(argv[i]));
    if(i + 1 &lt; argc){
      write(1, " ", 1);
    } else {
      write(1, "\n", 1);
    }
  }
  exit(0);
}
```

- `exec()`系统调用
  - 用可执行文件替换当前进程
  - 丢弃指令和数据存储器
  - 从文件中加载指令和内存
  - 保存文件描述符

- `exec(filename, argument-array)`
  - argument-array保存命令行参数;exec将参数传递给main()
  - 执行`cat user/echo.c`
  - `echo.c`程序演示了如何查看命令行参数

### 例子:`forkexec.c`。`fork()`一个新进程，`exec()`一个程序

```c
#include "kernel/types.h"
#include "user/user.h"

// forkexec.c: fork then exec

int
main()
{
  int pid, status;

  pid = fork();
  if(pid == 0){
    char *argv[] = { "echo", "THIS", "IS", "ECHO", 0 };
    exec("echo", argv);
    printf("exec failed!\n");
    exit(1);
  } else {
    printf("parent waiting\n");
    wait(&amp;status);
    printf("the child exited with status %d\n", status);
  }

  exit(0);
}
```

- `forkexec.c`包含一个常见的UNIX习惯用法:
  - fork()一个子进程
  - exec()子进程中的命令
  - 父进程调用`wait()`等待子进程结束

- 对于您键入的每个命令，shell都会fork/exec/wait
  - 在`wait()`完成之后，shell打印下一个提示符
  - 若想让程序在后台运行，可在命令的最后加上符号`&`，这样shell会跳过`wait()`

- `exec(status)`-> ` wait(&status)`
  - 状态约定:0表示成功，1表示命令遇到错误

- 注意:`fork()`会复制，但是`exec()`会丢弃复制的内存

这似乎很浪费，在“copy-on-write”实验室中，你将透明的删除复制

### 例子:`redirect.c`，重定向命令的输出

```c
#include "kernel/types.h"
#include "user/user.h"
#include "kernel/fcntl.h"

// redirect.c: run a command with output redirected

int
main()
{
  int pid;

  pid = fork();
  if(pid == 0){
    close(1);
    open("output.txt", O_WRONLY|O_CREATE);

    char *argv[] = { "echo", "this", "is", "redirected", "echo", 0 };
    exec("echo", argv);
    printf("exec failed!\n");
    exit(1);
  } else {
    wait((int *) 0);
  }

  exit(0);
}
```

shell如何完成重定向呢？

```bash
$ echo hello > out
```

答案是:通过`fork`产生子进程，然后在子进程中改变文件描述符1，再调用`exec`执行echo

- 注意:open()总是选择最小的未使用文件描述符;在重定向中，由于`close(1)`使得1成为了最小的文件描述符

- `fork` 、FDs（文件描述符）和`exec`可以很好地交互以实现I/O重定向
  - 将`fork`和`exec`分离给了子进程一个在`exec`之前更改文件描述符的机会

文件描述符提供了一种间接性：命令只使用描述符0和1，而不需要知道文件描述符到底指向去哪里

`exec`会保存shell所设置的文件描述符

- 因此:只有shell需要知道I/O重定向，而不是每个程序

- 关于设计决策，有必要问一下“为什么”:
  - 为什么要采用这些I/O和流程抽象?为什么不是别的?
  - 为什么要提供文件系统?为什么不让程序以自己的方式使用磁盘呢?
  - 为什么使用文件描述符?为什么不将文件名传递给write()?
  - 为什么文件是字节流，而不是磁盘块或格式化的记录?
  - 为什么不合并fork()和exec()呢?
  - UNIX设计工作得很好，但我们将看到其他设计!

### 例子:`pipe1.c`，通过管道交流

```c
// pipe1.c: communication over a pipe

#include "kernel/types.h"
#include "user/user.h"

int
main()
{
  int fds[2];
  char buf[100];
  int n;

  // create a pipe, with two FDs in fds[0], fds[1].
  pipe(fds);

  write(fds[1], "this is pipe1\n", 14);
  n = read(fds[0], buf, sizeof(buf));

  write(1, buf, n);

  exit(0);
}
```

shell是如何实现管道的呢

```bash
$ ls | grep x
```

- 文件描述符可以指向“管道”，也可以指向文件

- `pipe()`系统调用创建两个文件描述符
  - 第一个用于读取
  - 第二个用于写入

- 内核为每个管道维护一个缓冲区
  - `write()`追加到缓冲区
  - `read()`等待数据

### 例子:`pipe2.c`，进程之间的通信

```c
#include "kernel/types.h"
#include "user/user.h"

// pipe2.c: communication between two processes

int
main()
{
  int n, pid;
  int fds[2];
  char buf[100];

  // create a pipe, with two FDs in fds[0], fds[1].
  pipe(fds);

  pid = fork();
  if (pid == 0) {
    write(fds[1], "this is pipe2\n", 14);
  } else {
    n = read(fds[0], buf, sizeof(buf));
    write(1, buf, n);
  }

  exit(0);
}
```

- 管道和`fork()`很好地结合在一起来实现`ls | grep x`
  - shell创建一个管道，
  - 然后执行两次`fork`
  - 然后将`ls`的文件描述符1连接到管道的写文件描述符
  - 将`grep`的文件描述符0连接到管道的读文件描述符

管道是一个单独的抽象，但与fork()结合得很好。

### 例子:`list.c`，列出目录中的文件

```c
#include "kernel/types.h"
#include "user/user.h"

// list.c: list file names in the current directory

struct dirent {
  ushort inum;
  char name[14];
};

int
main()
{
  int fd;
  struct dirent e;

  fd = open(".", 0);
  while(read(fd, &amp;e, sizeof(e)) == sizeof(e)){
    if(e.name[0] != '\0'){
      printf("%s\n", e.name);
    }
  }
  exit(0);
}
```

ls如何得到一个目录中的文件列表呢?

你可以打开一个目录并读取它->文件名

"`.`"是进程当前目录的伪名称

请参阅`ls.c`了解更多细节

## 总结

- 我们已经了解了UNIX的I/O、文件系统和进程抽象。

- 接口很简单——只有整数和I/O缓冲区。

- 抽象组合得很好，例如I/O重定向。

你们将在下周的第一个实验中使用这些系统调用。