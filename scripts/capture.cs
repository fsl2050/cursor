using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

class C {
  static ClientWebSocket ws;
  static int id = 1;

  static void Main(string[] args) {
    Run(args).GetAwaiter().GetResult();
  }

  static async Task Run(string[] args) {
    string wsUrl = args[0];
    string outDir = args[1];
    int frames = int.Parse(args[2]);
    int intervalMs = int.Parse(args[3]);
    Directory.CreateDirectory(outDir);
    ws = new ClientWebSocket();
    await ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None);
    await Send("{\"id\":1,\"method\":\"Page.enable\"}");
    await Recv();
    await Send("{\"id\":2,\"method\":\"Emulation.setDeviceMetricsOverride\",\"params\":{\"width\":1280,\"height\":720,\"deviceScaleFactor\":1,\"mobile\":false}}");
    await Recv();
    await Task.Delay(3000);
    for (int i = 0; i < frames; i++) {
      int mid = ++id;
      await Send("{\"id\":" + mid + ",\"method\":\"Page.captureScreenshot\",\"params\":{\"format\":\"jpeg\",\"quality\":80}}");
      string msg;
      do { msg = await Recv(); } while (!msg.Contains("\"id\":" + mid));
      int idx = msg.IndexOf("\"data\":\"");
      if (idx >= 0) {
        idx += 8;
        int end = msg.IndexOf('"', idx);
        var b64 = msg.Substring(idx, end - idx);
        File.WriteAllBytes(Path.Combine(outDir, string.Format("frame_{0:D4}.jpg", i)), Convert.FromBase64String(b64));
      }
      if (i < frames - 1) await Task.Delay(intervalMs);
    }
    try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None); } catch { }
  }

  static async Task Send(string json) {
    var bytes = Encoding.UTF8.GetBytes(json);
    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
  }

  static async Task<string> Recv() {
    var buf = new byte[1024 * 1024 * 8];
    var sb = new StringBuilder();
    while (true) {
      var res = await ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
      sb.Append(Encoding.UTF8.GetString(buf, 0, res.Count));
      if (res.EndOfMessage) break;
    }
    return sb.ToString();
  }
}
