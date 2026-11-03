using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace PttFqu
{
    static class Program
    {
        private const int Port = 8081;
        private const string Host = "::1";
        private const string AppUrl = "http://[::1]:8081/";

        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string nodeExe = Path.Combine(baseDir, "node.exe");
                string serverScript = Path.Combine(baseDir, "portable", "server.mjs");

                if (!File.Exists(nodeExe))
                {
                    MessageBox.Show(
                        "找不到 node.exe 執行檔。\n請確認檔案完整性。",
                        "PTT-FQU 錯誤",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                if (!File.Exists(serverScript))
                {
                    MessageBox.Show(
                        "找不到 portable\\server.mjs 伺服器指令碼。",
                        "PTT-FQU 錯誤",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                bool isAlreadyRunning = IsPortOpen(Host, Port, 300);

                // Start node server in hidden mode
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "\"" + serverScript + "\"";
                psi.WorkingDirectory = baseDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                Process.Start(psi);

                // If it wasn't running, wait briefly for it to initialize
                if (!isAlreadyRunning)
                {
                    for (int i = 0; i < 20; i++)
                    {
                        Thread.Sleep(100);
                        if (IsPortOpen(Host, Port, 100))
                        {
                            break;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "啟動 PTT-FQU 發生錯誤：\n" + ex.Message,
                    "PTT-FQU 錯誤",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static bool IsPortOpen(string host, int port, int timeoutMs)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(timeoutMs);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
