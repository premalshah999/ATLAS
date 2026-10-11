// Source of atlas-sandbox.exe, the Windows sandbox launcher (ADR 0012). It is compiled on first use with the
// C# compiler that ships with the .NET Framework in every Windows 10/11 install, so ATLAS ships no binary.
//
//   atlas-sandbox.exe sid <container>        print the AppContainer SID (creating the profile)
//   atlas-sandbox.exe capsid <capability>    print the SID of a custom capability (used for toolchain ACLs)
//   atlas-sandbox.exe run <container|-> [--net] [--cap NAME]... [--mem MB] [--pty COLSxROWS] [--parent PID] --cmdline <command line>
//   --parent: when that process (the ATLAS daemon) exits, even by a crash, the job and every process in it are terminated.
//
// The command line is built by ATLAS (argument quoting, cmd.exe escaping for .cmd shims) and used verbatim.
// Container "-" runs without an AppContainer; only the operator's explicit unsandboxed opt-in uses it.
//
// `run` starts the program inside the AppContainer <container>: a low-privilege token with no access to the
// user's files except paths explicitly granted to the container SID, and no network unless --net adds the
// internetClient/privateNetwork capabilities. The process is created suspended, placed in a Job Object that
// kills the whole tree when the launcher exits, then resumed. --pty hosts it in a ConPTY.
export const HELPER_VERSION = '4';

export const HELPER_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class AtlasSandbox {
  const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000, CREATE_SUSPENDED = 0x4, CREATE_UNICODE_ENVIRONMENT = 0x400;
  const int STARTF_USESTDHANDLES = 0x100;
  static readonly IntPtr ATTR_SECURITY_CAPABILITIES = (IntPtr)0x00020009, ATTR_PSEUDOCONSOLE = (IntPtr)0x00020016;
  const int SE_GROUP_ENABLED = 0x4;

  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public int Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_CAPABILITIES { public IntPtr AppContainerSid; public IntPtr Capabilities; public int CapabilityCount; public int Reserved; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved, lpDesktop, lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }

  [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string desc, IntPtr caps, int count, out IntPtr sid);
  [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertSidToStringSid(IntPtr sid, out string s);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSidToSid(string s, out IntPtr sid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr a, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr t);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr r, out IntPtr w, IntPtr sa, int size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern int CreatePseudoConsole(COORD size, IntPtr input, IntPtr output, uint flags, out IntPtr hpc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern void ClosePseudoConsole(IntPtr hpc);
  [DllImport("kernelbase.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool DeriveCapabilitySidsFromName(string name, out IntPtr groupSids, out int groupCount, out IntPtr capSids, out int capCount);

  /** Every ATLAS container holds this capability; toolchain directories grant it read access once. */
  const string TOOLCHAIN_CAPABILITY = "atlasToolchain";
  static IntPtr CapabilitySid(string name) {
    IntPtr g, c; int gn, cn;
    if (!DeriveCapabilitySidsFromName(name, out g, out gn, out c, out cn) || cn < 1) Fail("cannot derive capability " + name + ": " + Marshal.GetLastWin32Error());
    return Marshal.ReadIntPtr(c, 0);
  }

  static void Fail(string msg) { Console.Error.WriteLine("atlas-sandbox: " + msg); Environment.Exit(125); }

  static IntPtr ContainerSid(string name) {
    IntPtr sid;
    int hr = CreateAppContainerProfile(name, name, "ATLAS sandbox", IntPtr.Zero, 0, out sid);
    if (hr == unchecked((int)0x800700B7)) hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
    if (hr != 0) Fail("cannot create AppContainer profile " + name + " (HRESULT 0x" + hr.ToString("X8") + ")");
    return sid;
  }

  static int Main(string[] argv) {
    if (argv.Length >= 2 && argv[0] == "sid") {
      string s; ConvertSidToStringSid(ContainerSid(argv[1]), out s); Console.WriteLine(s); return 0;
    }
    if (argv.Length >= 2 && argv[0] == "capsid") {
      string s; ConvertSidToStringSid(CapabilitySid(argv[1]), out s); Console.WriteLine(s); return 0;
    }
    if (argv.Length < 4 || argv[0] != "run") Fail("usage: atlas-sandbox run <container|-> [--net] [--mem MB] [--pty COLSxROWS] --cmdline <command line>");
    string name = argv[1]; bool net = false; long memMb = 0; int parent = 0; short cols = 0, rows = 0; string line = null; var extraCaps = new List<string>();
    for (int i = 2; i < argv.Length; i++) {
      if (argv[i] == "--net") net = true;
      else if (argv[i] == "--mem") memMb = long.Parse(argv[++i]);
      else if (argv[i] == "--pty") { var p = argv[++i].Split('x'); cols = short.Parse(p[0]); rows = short.Parse(p[1]); }
      else if (argv[i] == "--cmdline") line = argv[++i];
      else if (argv[i] == "--cap") extraCaps.Add(argv[++i]);
      else if (argv[i] == "--parent") parent = int.Parse(argv[++i]);
      else Fail("unknown option " + argv[i]);
    }
    if (string.IsNullOrEmpty(line)) Fail("missing --cmdline");
    var cmd = new StringBuilder(line, 32768);
    bool contained = name != "-";

    IntPtr sid = contained ? ContainerSid(name) : IntPtr.Zero;
    var caps = new List<SID_AND_ATTRIBUTES>();
    if (contained) caps.Add(new SID_AND_ATTRIBUTES { Sid = CapabilitySid(TOOLCHAIN_CAPABILITY), Attributes = SE_GROUP_ENABLED });
    if (contained) foreach (var c in extraCaps) caps.Add(new SID_AND_ATTRIBUTES { Sid = CapabilitySid(c), Attributes = SE_GROUP_ENABLED });
    if (net) foreach (var s in new[] { "S-1-15-3-1", "S-1-15-3-3" }) { IntPtr c; ConvertStringSidToSid(s, out c); caps.Add(new SID_AND_ATTRIBUTES { Sid = c, Attributes = SE_GROUP_ENABLED }); }
    IntPtr capArr = IntPtr.Zero;
    if (caps.Count > 0) {
      int sz = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
      capArr = Marshal.AllocHGlobal(sz * caps.Count);
      for (int k = 0; k < caps.Count; k++) Marshal.StructureToPtr(caps[k], capArr + k * sz, false);
    }
    var sc = new SECURITY_CAPABILITIES { AppContainerSid = sid, Capabilities = capArr, CapabilityCount = caps.Count };
    IntPtr scPtr = Marshal.AllocHGlobal(Marshal.SizeOf(sc)); Marshal.StructureToPtr(sc, scPtr, false);

    bool pty = cols > 0;
    IntPtr hpc = IntPtr.Zero, inR = IntPtr.Zero, inW = IntPtr.Zero, outR = IntPtr.Zero, outW = IntPtr.Zero;
    if (pty) {
      if (!CreatePipe(out inR, out inW, IntPtr.Zero, 0) || !CreatePipe(out outR, out outW, IntPtr.Zero, 0)) Fail("cannot create pipes");
      int hr = CreatePseudoConsole(new COORD { X = cols, Y = rows }, inR, outW, 0, out hpc);
      if (hr != 0) Fail("ConPTY unavailable (HRESULT 0x" + hr.ToString("X8") + "); Windows 10 1809 or later is required");
    }

    IntPtr size = IntPtr.Zero; int attrs = (pty ? 1 : 0) + (contained ? 1 : 0);
    if (attrs == 0) attrs = 1;
    InitializeProcThreadAttributeList(IntPtr.Zero, attrs, 0, ref size);
    IntPtr list = Marshal.AllocHGlobal(size);
    if (!InitializeProcThreadAttributeList(list, attrs, 0, ref size)) Fail("attribute list: " + Marshal.GetLastWin32Error());
    if (contained && !UpdateProcThreadAttribute(list, 0, ATTR_SECURITY_CAPABILITIES, scPtr, (IntPtr)Marshal.SizeOf(sc), IntPtr.Zero, IntPtr.Zero)) Fail("security capabilities: " + Marshal.GetLastWin32Error());
    if (pty && !UpdateProcThreadAttribute(list, 0, ATTR_PSEUDOCONSOLE, hpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) Fail("pseudoconsole: " + Marshal.GetLastWin32Error());

    var si = new STARTUPINFOEX(); si.StartupInfo.cb = Marshal.SizeOf(si); si.lpAttributeList = list;
    if (!pty) { si.StartupInfo.dwFlags = STARTF_USESTDHANDLES; si.StartupInfo.hStdInput = GetStdHandle(-10); si.StartupInfo.hStdOutput = GetStdHandle(-11); si.StartupInfo.hStdError = GetStdHandle(-12); }

    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    var lim = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    lim.Basic.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE: the tree dies with this launcher
    if (memMb > 0) { lim.Basic.LimitFlags |= 0x200; lim.JobMemoryLimit = (UIntPtr)(ulong)(memMb * 1024 * 1024); }
    if (!SetInformationJobObject(job, 9, ref lim, Marshal.SizeOf(lim))) Fail("job limits: " + Marshal.GetLastWin32Error());

    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, !pty, EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, Environment.CurrentDirectory, ref si, out pi)) {
      int err = Marshal.GetLastWin32Error();
      Console.Error.WriteLine("atlas-sandbox: cannot start " + line + " (error " + err + (err == 2 ? ": not found" : err == 5 ? ": access denied — the container cannot read this program" : "") + ")");
      return 127;
    }
    if (!AssignProcessToJobObject(job, pi.hProcess)) { TerminateProcess(pi.hProcess, 1); Fail("cannot assign the process to a job: " + Marshal.GetLastWin32Error()); }
    ResumeThread(pi.hThread);
    if (parent > 0) {
      // SYNCHRONIZE only. If the daemon is already gone, nothing must keep running.
      IntPtr hParent = OpenProcess(0x00100000, false, parent);
      if (hParent == IntPtr.Zero) { TerminateJobObject(job, 137); return 137; }
      new Thread(() => { WaitForSingleObject(hParent, 0xFFFFFFFF); TerminateJobObject(job, 137); Environment.Exit(137); }) { IsBackground = true }.Start();
    }

    if (pty) {
      CloseHandle(inR); CloseHandle(outW);
      var stdin = Console.OpenStandardInput(); var stdout = Console.OpenStandardOutput();
      var toPty = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(inW, true), FileAccess.Write);
      var fromPty = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(outR, true), FileAccess.Read);
      new Thread(() => { var b = new byte[8192]; int n; try { while ((n = stdin.Read(b, 0, b.Length)) > 0) { toPty.Write(b, 0, n); toPty.Flush(); } } catch { } }) { IsBackground = true }.Start();
      new Thread(() => { var b = new byte[8192]; int n; try { while ((n = fromPty.Read(b, 0, b.Length)) > 0) { stdout.Write(b, 0, n); stdout.Flush(); } } catch { } }) { IsBackground = true }.Start();
    }
    WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
    uint code; GetExitCodeProcess(pi.hProcess, out code);
    if (pty) { Thread.Sleep(100); ClosePseudoConsole(hpc); }
    return (int)code;
  }
}
`;
