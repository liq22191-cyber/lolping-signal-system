' lolPing 源码版启动器 —— 双击这个文件即可启动
' 说明：本文件必须保存为 GBK 编码，否则中文路径会乱码

Option Explicit

Dim sh, fso, projDir, logDir, logFile

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projDir = "E:\项目代码\lolPing"
logDir  = projDir & "\临时"
logFile = logDir & "\启动日志.txt"

' 检查项目文件夹还在不在
If Not fso.FolderExists(projDir) Then
    MsgBox "找不到项目文件夹：" & vbCrLf & vbCrLf & projDir & vbCrLf & vbCrLf & _
           "请确认这个文件夹没有被移动或删除。", 16, "lolPing 启动失败"
    WScript.Quit 1
End If

' 确保日志目录存在
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

' 清掉会干扰 Electron 的环境变量（某些开发工具会设置它，导致启动崩溃）
On Error Resume Next
sh.Environment("PROCESS").Remove("ELECTRON_RUN_AS_NODE")
On Error GoTo 0

sh.CurrentDirectory = projDir

' 后台启动，隐藏命令行窗口，输出写进日志方便排查
sh.Run "cmd /c npm run dev > """ & logFile & """ 2>&1", 0, False

MsgBox "lolPing 正在启动……" & vbCrLf & vbCrLf & _
       "大约 10~20 秒后会弹出【设置】窗口。" & vbCrLf & _
       "关掉设置窗口后，它会缩到右下角托盘区。" & vbCrLf & vbCrLf & _
       "按住 Alt + 拖动鼠标左键 = 打开信号轮盘" & vbCrLf & _
       "Ctrl + Alt + P = 临时开关信号" & vbCrLf & vbCrLf & _
       "如果 30 秒后还没反应，把这个日志文件发给我：" & vbCrLf & logFile, _
       64, "lolPing"
