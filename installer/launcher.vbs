' TOKO PODOMORO launcher (docs/design.md section 11.1).
' Runs without a console window (wscript). Starts the bundled server once, waits for
' /api/health, then opens Edge in app mode (or the default browser if Edge is missing).
' Keep this file ASCII: Windows Script Host reads it as ANSI.
Option Explicit

Const APP_TITLE = "TOKO PODOMORO"
Const DEFAULT_PORT = 4747
Const WAIT_STEP_MS = 250
Const WAIT_STEPS = 60 ' 15 seconds

Dim fso, shell, appDir, dataDir, port, url, logFile, errorFile
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = shell.ExpandEnvironmentStrings("%ProgramData%") & "\TokoPodomoro"
logFile = dataDir & "\server.log"
errorFile = dataDir & "\startup-error.txt"
port = ReadPort(dataDir & "\config.json")
url = "http://127.0.0.1:" & port

' Already running (second click, or autostart already did it): only open the window.
If IsHealthy() Then
  OpenApp
  WScript.Quit 0
End If

StartServer
WaitForServer

' --- Steps ---

Sub StartServer()
  Dim nodeExe, mainJs
  nodeExe = appDir & "\node\node.exe"
  mainJs = appDir & "\app\main.js"
  If Not fso.FileExists(nodeExe) Or Not fso.FileExists(mainJs) Then
    Fail "File aplikasi tidak lengkap. Pasang ulang TOKO PODOMORO." & vbCrLf & appDir
  End If
  If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir
  If fso.FileExists(errorFile) Then fso.DeleteFile errorFile, True

  ' Production mode: data in C:\ProgramData\TokoPodomoro (docs/design.md 2.1).
  shell.Environment("Process").Item("NODE_ENV") = "production"
  shell.CurrentDirectory = appDir & "\app"
  ' Window style 0 = hidden; do not wait. Output goes to server.log for support.
  shell.Run "cmd /c """"" & nodeExe & """ """ & mainJs & """ > """ & logFile & """ 2>&1""", 0, False
End Sub

Sub WaitForServer()
  Dim i
  For i = 1 To WAIT_STEPS
    WScript.Sleep WAIT_STEP_MS
    If IsHealthy() Then
      OpenApp
      WScript.Quit 0
    End If
    If fso.FileExists(errorFile) Then
      ' Two launchers at once: the other one may have started the server.
      WScript.Sleep 1000
      If IsHealthy() Then
        OpenApp
        WScript.Quit 0
      End If
      Fail ReadText(errorFile)
    End If
  Next
  Fail "TOKO PODOMORO belum siap setelah 15 detik. Coba buka lagi." & vbCrLf & _
    "Jika masih gagal, kirim file log ini ke teknisi:" & vbCrLf & logFile
End Sub

Sub OpenApp()
  Dim edge
  edge = FindEdge()
  If edge <> "" Then
    shell.Run """" & edge & """ --app=" & url, 1, False
  Else
    shell.Run url, 1, False
  End If
End Sub

Sub Fail(message)
  MsgBox message, vbCritical + vbOKOnly, APP_TITLE
  WScript.Quit 1
End Sub

' --- Helpers ---

' True when this app's server answers GET /api/health.
Function IsHealthy()
  Dim http
  IsHealthy = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.open "GET", url & "/api/health", False
  http.send
  If Err.Number = 0 Then
    If http.status = 200 And InStr(http.responseText, """status"":""ok""") > 0 Then IsHealthy = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

' Port from config.json ({ "port": 4747 }); the default when missing or unreadable.
Function ReadPort(file)
  Dim re, matches
  ReadPort = DEFAULT_PORT
  If Not fso.FileExists(file) Then Exit Function
  Set re = New RegExp
  re.Pattern = """port""\s*:\s*(\d+)"
  Set matches = re.Execute(ReadText(file))
  If matches.Count > 0 Then ReadPort = CLng(matches(0).SubMatches(0))
End Function

' Reads a UTF-8 text file (the server writes UTF-8).
Function ReadText(file)
  Dim stream
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 2 ' text
  stream.Charset = "utf-8"
  stream.Open
  stream.LoadFromFile file
  ReadText = Trim(stream.ReadText)
  stream.Close
End Function

' msedge.exe from App Paths, else the usual install folders; "" when not found.
' (A local variable: reading the function name inside a VBScript function calls it again.)
Function FindEdge()
  Dim found, registered, candidates, candidate
  found = ""
  On Error Resume Next
  registered = shell.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe\")
  If Err.Number = 0 Then
    If fso.FileExists(registered) Then found = registered
  End If
  Err.Clear
  On Error GoTo 0

  If found = "" Then
    candidates = Array( _
      shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
      shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
      shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\Edge\Application\msedge.exe")
    For Each candidate In candidates
      If found = "" And fso.FileExists(candidate) Then found = candidate
    Next
  End If
  FindEdge = found
End Function
