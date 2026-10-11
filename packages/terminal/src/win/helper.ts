// Source of atlas-sandbox.exe, the Windows sandbox launcher (ADR 0012). It is compiled on first use with the
// C# compiler that ships with the .NET Framework in every Windows 10/11 install, so ATLAS ships no binary.
//
//   atlas-sandbox.exe sid <container>        print the AppContainer SID (creating the profile)
//   atlas-sandbox.exe capsid <capability>    print the SID of a custom capability (used for toolchain ACLs)
//   atlas-sandbox.exe run <container|-> [--net] [--cap NAME]... [--mem MB] [--pty COLSxROWS] [--parent PID] --cmdline <command line>
//   --parent: when that process (the ATLAS daemon) exits, even by a crash, the job and every process in it are terminated.
//   run - --restricted SIDLIST [--low] ...   restricted-token mode (ADR 0016, operator-approved experiment): the
//     operator's token with the user and every group except a basic allowlist turned deny-only, all privileges
//     removed, the restricting SIDs in SIDLIST (comma separated SIDs or the names everyone, users, authusers,
//     interactive, logon, restricted), and with --low the low integrity level. Unlike an AppContainer it lets Node
//     create the named pipes it needs for child stdio. Not used by ATLAS until it passes the sandbox test suite.
//   atlas-sandbox.exe logonsid               print the logon SID of the current session
//   atlas-sandbox.exe pipetest               diagnostic (ADR 0016): the Win32 steps libuv takes for a piped child,
//                                             each with its error code; meant to run under --restricted
//
// The command line is built by ATLAS (argument quoting, cmd.exe escaping for .cmd shims) and used verbatim.
// Container "-" runs without an AppContainer; only the operator's explicit unsandboxed opt-in uses it.
//
// `run` starts the program inside the AppContainer <container>: a low-privilege token with no access to the
// user's files except paths explicitly granted to the container SID, and no network unless --net adds the
// internetClient/privateNetwork capabilities. The process is created suspended, placed in a Job Object that
// kills the whole tree when the launcher exits, then resumed. --pty hosts it in a ConPTY.
export const HELPER_VERSION = '7';

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
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr tok);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr t, int cls, IntPtr buf, int len, out int ret);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, int disableCount, SID_AND_ATTRIBUTES[] disable, int delPrivCount, IntPtr delPriv, int restrictCount, SID_AND_ATTRIBUTES[] restrict, out IntPtr newToken);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr t, int cls, IntPtr info, int len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern int GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, int rev, out IntPtr sd, IntPtr size);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateNamedPipe(string name, uint openMode, uint pipeMode, uint maxInst, uint outBuf, uint inBuf, uint timeout, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sa, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(IntPtr h, int type, uint info, IntPtr owner, IntPtr group, out IntPtr dacl, IntPtr sacl, out IntPtr sd);
  [DllImport("advapi32.dll", SetLastError = true)] static extern uint SetSecurityInfo(IntPtr h, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("advapi32.dll", SetLastError = true)] static extern uint SetEntriesInAcl(int count, EXPLICIT_ACCESS[] entries, IntPtr oldAcl, out IntPtr newAcl);
  [StructLayout(LayoutKind.Sequential)] struct TRUSTEE { public IntPtr pMultipleTrustee; public int MultipleTrusteeOperation; public int TrusteeForm; public int TrusteeType; public IntPtr ptstrName; }
  [StructLayout(LayoutKind.Sequential)] struct EXPLICIT_ACCESS { public uint grfAccessPermissions; public int grfAccessMode; public uint grfInheritance; public TRUSTEE Trustee; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessAsUser(IntPtr tok, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
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

  static string SidString(IntPtr sid) { string s; ConvertSidToStringSid(sid, out s); return s; }
  static IntPtr Sid(string s) { IntPtr p; if (!ConvertStringSidToSid(s, out p)) Fail("bad SID " + s); return p; }

  /** The groups of a token: (sid, attributes). */
  static List<SID_AND_ATTRIBUTES> TokenGroups(IntPtr tok) {
    int len; GetTokenInformation(tok, 2, IntPtr.Zero, 0, out len);
    IntPtr buf = Marshal.AllocHGlobal(len);
    if (!GetTokenInformation(tok, 2, buf, len, out len)) Fail("token groups: " + Marshal.GetLastWin32Error());
    int n = Marshal.ReadInt32(buf); int sz = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
    var list = new List<SID_AND_ATTRIBUTES>();
    for (int i = 0; i < n; i++) list.Add((SID_AND_ATTRIBUTES)Marshal.PtrToStructure(buf + IntPtr.Size + i * sz, typeof(SID_AND_ATTRIBUTES)));
    return list;
  }
  static IntPtr TokenUser(IntPtr tok) {
    int len; GetTokenInformation(tok, 1, IntPtr.Zero, 0, out len);
    IntPtr buf = Marshal.AllocHGlobal(len);
    if (!GetTokenInformation(tok, 1, buf, len, out len)) Fail("token user: " + Marshal.GetLastWin32Error());
    return Marshal.ReadIntPtr(buf);
  }
  static IntPtr OwnToken() {
    IntPtr tok; // DUPLICATE | QUERY | ASSIGN_PRIMARY | ADJUST_DEFAULT
    if (!OpenProcessToken(GetCurrentProcess(), 0x8B, out tok)) Fail("open token: " + Marshal.GetLastWin32Error());
    return tok;
  }
  static string LogonSid(IntPtr tok) {
    foreach (var g in TokenGroups(tok)) if (((uint)g.Attributes & 0xC0000000u) == 0xC0000000u) return SidString(g.Sid);
    return null;
  }

  /** Groups that stay usable for the normal access check; the user and every other group become deny-only. */
  static readonly HashSet<string> KEEP = new HashSet<string> { "S-1-1-0", "S-1-5-32-545", "S-1-5-11", "S-1-5-4", "S-1-2-0", "S-1-2-1", "S-1-5-15" };

  static IntPtr RestrictedToken(string sidList, bool low) {
    IntPtr tok = OwnToken();
    string logon = LogonSid(tok);
    var disable = new List<SID_AND_ATTRIBUTES> { new SID_AND_ATTRIBUTES { Sid = TokenUser(tok) } };
    foreach (var g in TokenGroups(tok)) {
      string s = SidString(g.Sid);
      if (s.StartsWith("S-1-16-") || KEEP.Contains(s) || s == logon) continue;
      disable.Add(new SID_AND_ATTRIBUTES { Sid = g.Sid });
    }
    var restrict = new List<SID_AND_ATTRIBUTES>();
    foreach (var raw in sidList.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) {
      string s = raw == "everyone" ? "S-1-1-0" : raw == "users" ? "S-1-5-32-545" : raw == "authusers" ? "S-1-5-11" : raw == "interactive" ? "S-1-5-4" : raw == "restricted" ? "S-1-5-12" : raw == "logon" ? logon : raw;
      if (s == null) Fail("this session has no logon SID");
      restrict.Add(new SID_AND_ATTRIBUTES { Sid = Sid(s) });
    }
    IntPtr rt; // DISABLE_MAX_PRIVILEGE
    if (!CreateRestrictedToken(tok, 0x1, disable.Count, disable.ToArray(), 0, IntPtr.Zero, restrict.Count, restrict.Count > 0 ? restrict.ToArray() : null, out rt)) Fail("restricted token: " + Marshal.GetLastWin32Error());
    // Objects the process creates without inherited ACEs (the named pipes libuv makes for child stdio) get the token's
    // default DACL. The inherited one grants the user SID, which is deny-only here, so the process could not open its
    // own pipes (CI run 38158723502: piped children failed with EPERM). Grant SYSTEM, the logon SID and the
    // sandbox's own restricting SIDs instead, as Chromium's sandbox does.
    var own = new List<IntPtr>();
    foreach (var r in restrict) { string rs = SidString(r.Sid); if (rs != "S-1-1-0" && rs != "S-1-5-32-545" && rs != "S-1-5-11" && rs != "S-1-5-4" && rs != "S-1-5-12" && rs != logon) own.Add(r.Sid); }
    GrantWindowObjects(own);
    var sddl = new StringBuilder("D:(A;;GA;;;SY)");
    if (logon != null) sddl.Append("(A;;GA;;;" + logon + ")");
    foreach (var r in restrict) { string rs = SidString(r.Sid); if (rs != "S-1-1-0" && rs != "S-1-5-32-545" && rs != "S-1-5-11" && rs != "S-1-5-4" && rs != logon) sddl.Append("(A;;GA;;;" + rs + ")"); }
    IntPtr sd = IntPtr.Zero, dacl = IntPtr.Zero; bool present = false, defaulted = false;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl.ToString(), 1, out sd, IntPtr.Zero) || !GetSecurityDescriptorDacl(sd, out present, out dacl, out defaulted)) Fail("default DACL: " + Marshal.GetLastWin32Error());
    IntPtr tdd = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(tdd, dacl);
    if (!SetTokenInformation(rt, 6, tdd, IntPtr.Size)) Fail("set default DACL: " + Marshal.GetLastWin32Error()); // TokenDefaultDacl
    if (low) {
      IntPtr lowSid = Sid("S-1-16-4096");
      int sz = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
      IntPtr tml = Marshal.AllocHGlobal(sz);
      Marshal.StructureToPtr(new SID_AND_ATTRIBUTES { Sid = lowSid, Attributes = 0x20 }, tml, false); // SE_GROUP_INTEGRITY
      if (!SetTokenInformation(rt, 25, tml, sz + GetLengthSid(lowSid))) Fail("integrity level: " + Marshal.GetLastWin32Error());
    }
    return rt;
  }

  /**
   * A restricted token passes an access check only if its restricting SIDs are granted too. The window station and
   * desktop grant the logon SID; to keep the logon SID out of the restricting list (it is granted on every task's
   * root, so it would let one sandbox open another's), the sandbox's own SIDs are added to both (CI run 38161018218,
   * variant H: DLL initialization failed without it). Chromium's sandbox does the same.
   */
  static void GrantWindowObjects(List<IntPtr> sids) {
    if (sids.Count == 0) return;
    foreach (var h in new[] { GetProcessWindowStation(), GetThreadDesktop(GetCurrentThreadId()) }) {
      IntPtr dacl, sd;
      if (GetSecurityInfo(h, 7, 4, IntPtr.Zero, IntPtr.Zero, out dacl, IntPtr.Zero, out sd) != 0) Fail("window object security: " + Marshal.GetLastWin32Error()); // SE_WINDOW_OBJECT, DACL
      var entries = new EXPLICIT_ACCESS[sids.Count];
      for (int i = 0; i < sids.Count; i++) entries[i] = new EXPLICIT_ACCESS { grfAccessPermissions = 0x10000000, grfAccessMode = 1, grfInheritance = 0, Trustee = new TRUSTEE { TrusteeForm = 0, TrusteeType = 0, ptstrName = sids[i] } };
      IntPtr acl;
      uint e = SetEntriesInAcl(entries.Length, entries, dacl, out acl);
      if (e != 0) Fail("window object ACL: " + e);
      e = SetSecurityInfo(h, 7, 4, IntPtr.Zero, IntPtr.Zero, acl, IntPtr.Zero);
      if (e != 0) Fail("set window object ACL: " + e);
    }
  }

  /** Replays libuv's piped-child steps and prints each Win32 result (ADR 0016 diagnostic). */
  static int PipeTest() {
    string name = @"\\.\pipe\atlas-pt-" + System.Diagnostics.Process.GetCurrentProcess().Id;
    IntPtr bad = (IntPtr)(-1);
    // libuv: PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | WRITE_DAC | FILE_FLAG_FIRST_PIPE_INSTANCE, default security.
    IntPtr srv = CreateNamedPipe(name, 0x3 | 0x40000000 | 0x40000 | 0x80000, 0, 1, 65536, 65536, 0, IntPtr.Zero);
    Console.WriteLine("PIPETEST server " + (srv == bad ? "ERR " + Marshal.GetLastWin32Error() : "ok"));
    if (srv == bad) return 1;
    IntPtr cli = CreateFile(name, 0x80000000 | 0x100, 0, IntPtr.Zero, 3, 0, IntPtr.Zero); // GENERIC_READ | FILE_WRITE_ATTRIBUTES
    Console.WriteLine("PIPETEST client-read " + (cli == bad ? "ERR " + Marshal.GetLastWin32Error() : "ok"));
    if (cli == bad) return 1;
    SetHandleInformation(cli, 1, 1);
    var si = new STARTUPINFOEX(); si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES; si.StartupInfo.hStdInput = cli; si.StartupInfo.hStdOutput = GetStdHandle(-11); si.StartupInfo.hStdError = GetStdHandle(-12);
    PROCESS_INFORMATION pi;
    var cmd = new StringBuilder("\"" + System.Reflection.Assembly.GetExecutingAssembly().Location + "\" logonsid");
    bool ok = CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, true, CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, Environment.CurrentDirectory, ref si, out pi);
    Console.WriteLine("PIPETEST child-with-pipe " + (ok ? "ok" : "ERR " + Marshal.GetLastWin32Error()));
    if (ok) { WaitForSingleObject(pi.hProcess, 5000); uint code; GetExitCodeProcess(pi.hProcess, out code); Console.WriteLine("PIPETEST child-exit " + code); }
    return 0;
  }

  static int Main(string[] argv) {
    if (argv.Length >= 1 && argv[0] == "pipetest") return PipeTest();
    if (argv.Length >= 1 && argv[0] == "logonsid") { string l = LogonSid(OwnToken()); if (l == null) Fail("no logon SID"); Console.WriteLine(l); return 0; }
    if (argv.Length >= 2 && argv[0] == "sid") {
      string s; ConvertSidToStringSid(ContainerSid(argv[1]), out s); Console.WriteLine(s); return 0;
    }
    if (argv.Length >= 2 && argv[0] == "capsid") {
      string s; ConvertSidToStringSid(CapabilitySid(argv[1]), out s); Console.WriteLine(s); return 0;
    }
    if (argv.Length < 4 || argv[0] != "run") Fail("usage: atlas-sandbox run <container|-> [--net] [--mem MB] [--pty COLSxROWS] --cmdline <command line>");
    string name = argv[1]; bool net = false, low = false; string restrictedSids = null; long memMb = 0; int parent = 0; short cols = 0, rows = 0; string line = null; var extraCaps = new List<string>();
    for (int i = 2; i < argv.Length; i++) {
      if (argv[i] == "--net") net = true;
      else if (argv[i] == "--mem") memMb = long.Parse(argv[++i]);
      else if (argv[i] == "--pty") { var p = argv[++i].Split('x'); cols = short.Parse(p[0]); rows = short.Parse(p[1]); }
      else if (argv[i] == "--cmdline") line = argv[++i];
      else if (argv[i] == "--cap") extraCaps.Add(argv[++i]);
      else if (argv[i] == "--parent") parent = int.Parse(argv[++i]);
      else if (argv[i] == "--restricted") restrictedSids = argv[++i];
      else if (argv[i] == "--low") low = true;
      else Fail("unknown option " + argv[i]);
    }
    if (string.IsNullOrEmpty(line)) Fail("missing --cmdline");
    var cmd = new StringBuilder(line, 32768);
    bool contained = name != "-";
    if (restrictedSids != null && contained) Fail("--restricted runs without an AppContainer: use - as the container");
    IntPtr rtoken = restrictedSids != null ? RestrictedToken(restrictedSids, low) : IntPtr.Zero;

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
    uint cflags = EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT;
    bool started = rtoken != IntPtr.Zero
      ? CreateProcessAsUser(rtoken, null, cmd, IntPtr.Zero, IntPtr.Zero, !pty, cflags, IntPtr.Zero, Environment.CurrentDirectory, ref si, out pi)
      : CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, !pty, cflags, IntPtr.Zero, Environment.CurrentDirectory, ref si, out pi);
    if (!started) {
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
