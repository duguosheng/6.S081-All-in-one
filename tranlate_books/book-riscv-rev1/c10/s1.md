# 5.1 代码：控制台输入 

控制台驱动程序（***console.c***）是驱动程序结构的简单说明。控制台驱动程序通过连接到RISC-V的UART串口硬件接受人们键入的字符。控制台驱动程序一次累积一行输入，处理如`backspace`和`Ctrl-u`的特殊输入字符。用户进程，如Shell，使用`read`系统调用从控制台获取输入行。当您在QEMU中通过键盘输入到xv6时，您的按键将通过QEMU模拟的UART硬件传递到xv6。

驱动程序管理的UART硬件是由QEMU仿真的16550芯片。在真正的计算机上，16550将管理连接到终端或其他计算机的RS232串行链路。运行QEMU时，它连接到键盘和显示器。

UART硬件在软件中看起来是一组**内存映射**的控制寄存器。也就是说，存在一些RISC-V硬件连接到UART的物理地址，以便载入(load)和存储(store)操作与设备硬件而不是内存交互。UART的内存映射地址起始于`0x10000000`或`UART0` (***kernel/memlayout.h***:21)。有几个宽度为一字节的UART控制寄存器，它们关于UART0的偏移量在(***kernel/uart.c***:22)中定义。例如，LSR寄存器包含指示输入字符是否正在等待软件读取的位。这些字符（如果有的话）可用于从RHR寄存器读取。每次读取一个字符，UART硬件都会从等待字符的内部FIFO寄存器中删除它，并在FIFO为空时清除LSR中的“就绪”位。UART传输硬件在很大程度上独立于接收硬件；如果软件向THR写入一个字节，则UART传输该字节。

Xv6的`main`函数调用`consoleinit`（***kernel/console.c***:184）来初始化UART硬件。该代码配置UART：UART对接收到的每个字节的输入生成一个接收中断，对发送完的每个字节的输出生成一个发送完成中断（***kernel/uart.c***:53）。

xv6的shell通过***init.c*** (***user/init.c***:19)中打开的文件描述符从控制台读取输入。对`read`的调用实现了从内核流向`consoleread` (***kernel/console.c***:82)的数据通路。`consoleread`等待输入到达（通过中断）并在`cons.buf`中缓冲，将输入复制到用户空间，然后（在整行到达后）返回给用户进程。如果用户还没有键入整行，任何读取进程都将在`sleep`系统调用中等待（***kernel/console.c***:98）（第7章解释了`sleep`的细节）。

当用户输入一个字符时，UART硬件要求RISC-V发出一个中断，从而激活xv6的陷阱处理程序。陷阱处理程序调用`devintr`（***kernel/trap.c***:177），它查看RISC-V的`scause`寄存器，发现中断来自外部设备。然后它要求一个称为PLIC的硬件单元告诉它哪个设备中断了（***kernel/trap.c***:186）。如果是UART，`devintr`调用`uartintr`。

`uartintr`（***kernel/uart.c***:180）从UART硬件读取所有等待输入的字符，并将它们交给`consoleintr`（***kernel/console.c***:138）；它不会等待字符，因为未来的输入将引发一个新的中断。`consoleintr`的工作是在***cons.buf***中积累输入字符，直到一整行到达。`consoleintr`对`backspace`和其他少量字符进行特殊处理。当换行符到达时，`consoleintr`唤醒一个等待的`consoleread`（如果有的话）。

一旦被唤醒，`consoleread`将监视***cons.buf***中的一整行，将其复制到用户空间，并返回（通过系统调用机制）到用户空间。