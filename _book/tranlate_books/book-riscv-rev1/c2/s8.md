# 2.8 练习

你可以使用**gdb**来观察最开始的“内核空间到用户空间”的转换。

1. 请运行`make qemu-gdb`（如果想以单线程方式，则输入`make CPUS=1 qemu-gdb`）。
2. 打开另一个窗口，并在相同的目录下运行`gdb`（注：应当使用riscv64-linux-gnu-gdb）。
3. 键入gdb命令`break*0x3ffffff10e`，这将在内核中的`sret`指令处设置一个断点，该指令从内核空间跳入用户空间。
4. 键入gdb命令`continue`。gdb应当会停留在即将执行`sret`的断点处。
5. 键入`stepi`。gdb现在应当会指示目前在地址为`0x0`处执行，该地址就是以***initcode.S***开始的用户空间的起始地址

