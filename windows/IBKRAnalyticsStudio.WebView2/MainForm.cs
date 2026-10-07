using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace IBKRAnalyticsStudio.WebView2;

public sealed class MainForm : Form
{
    private const string AppVersion = "2.1.8";
    private const string AppHost = "ibkr-analytics.local";
    private static readonly Color AppBackground = Color.FromArgb(15, 23, 42);
    private static readonly Color AppSurface = Color.FromArgb(17, 26, 44);
    private static readonly Color AppBorder = Color.FromArgb(45, 64, 96);
    private static readonly Color AppText = Color.FromArgb(226, 232, 240);
    private readonly HttpClient flexHttpClient = new();
    private readonly FlexApiClient flexApiClient;
    private readonly UpdateClient updateClient;
    private readonly Microsoft.Web.WebView2.WinForms.WebView2 webView = new();
    private readonly StatusStrip statusStrip = new();
    private readonly ToolStripStatusLabel statusLabel = new("Starting...");

    public MainForm()
    {
        flexHttpClient.DefaultRequestHeaders.UserAgent.ParseAdd($"IBKRAnalyticsStudio/{AppVersion} WebView2");
        flexApiClient = new FlexApiClient(flexHttpClient);
        updateClient = new UpdateClient(flexHttpClient);

        Text = "IBKR Analytics Studio";
        Icon? appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (appIcon is not null)
        {
            Icon = appIcon;
        }
        Width = 1280;
        Height = 860;
        MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = AppBackground;

        statusStrip.Items.Add(statusLabel);
        statusStrip.BackColor = AppBackground;
        statusStrip.ForeColor = AppText;
        statusStrip.SizingGrip = false;
        statusLabel.ForeColor = AppText;

        webView.Dock = DockStyle.Fill;
        webView.DefaultBackgroundColor = AppBackground;

        Controls.Add(webView);
        Controls.Add(statusStrip);
        Load += async (_, _) => await InitializeWebViewAsync();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyNativeWindowTheme();
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            string contentRoot = ResolveContentRoot();
            string userDataRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "IBKR Analytics Studio",
                "WebView2Profile");

            Directory.CreateDirectory(userDataRoot);

            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataRoot);

            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                AppHost,
                contentRoot,
                CoreWebView2HostResourceAccessKind.Allow);

            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.DocumentTitleChanged += (_, _) =>
            {
                string title = webView.CoreWebView2.DocumentTitle;
                if (!string.IsNullOrWhiteSpace(title))
                {
                    Text = title;
                }
            };

            webView.CoreWebView2.NavigationCompleted += (_, args) =>
            {
                statusLabel.Text = args.IsSuccess ? "Ready" : $"Navigation failed: {args.WebErrorStatus}";
            };
            webView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;

            webView.CoreWebView2.Navigate($"https://{AppHost}/index.html");
        }
        catch (Exception error)
        {
            statusLabel.Text = "Failed to start";
            MessageBox.Show(
                this,
                $"Unable to start IBKR Analytics Studio.\n\n{error.Message}",
                "IBKR Analytics Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private async void HandleWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        FlexBridgeRequest? request = FlexBridgeRequest.TryParse(args.WebMessageAsJson);
        if (request is null)
        {
            return;
        }

        string requestId = string.IsNullOrWhiteSpace(request.RequestId) ? Guid.NewGuid().ToString("N") : request.RequestId;
        if (request.Type == "app.updateCheck")
        {
            await HandleUpdateCheckAsync(requestId);
            return;
        }

        if (request.Type == "app.openExternal")
        {
            HandleOpenExternal(requestId, request.Url);
            return;
        }

        if (request.Type != "flex.fetch")
        {
            return;
        }

        try
        {
            statusLabel.Text = "Fetching IBKR Flex report...";
            FlexFetchResult result = await flexApiClient.FetchReportAsync(
                request.Token ?? "",
                request.QueryId ?? "",
                request.Start ?? "", request.End ?? "",
                CancellationToken.None);

            PostFlexResponse(new
            {
                type = "flex.result",
                requestId,
                ok = true,
                reportText = result.ReportText,
                contentType = result.ContentType,
                referenceCode = result.ReferenceCode
            });
            statusLabel.Text = "IBKR Flex report loaded";
        }
        catch (Exception error)
        {
            PostFlexResponse(new
            {
                type = "flex.result",
                requestId,
                ok = false,
                error = error.Message
            });
            statusLabel.Text = "IBKR Flex request failed";
        }
    }

    private async Task HandleUpdateCheckAsync(string requestId)
    {
        try
        {
            statusLabel.Text = "Checking for updates...";
            UpdateCheckResult result = await updateClient.CheckLatestAsync(AppVersion, CancellationToken.None);
            PostFlexResponse(new
            {
                type = "app.updateResult",
                requestId,
                ok = true,
                result
            });
            statusLabel.Text = result.UpdateAvailable
                ? $"Update available: {result.LatestVersion}"
                : result.ReleaseAvailable ? "App is up to date" : "No release available";
        }
        catch (Exception error)
        {
            PostFlexResponse(new
            {
                type = "app.updateResult",
                requestId,
                ok = false,
                error = error.Message
            });
            statusLabel.Text = "Update check failed";
        }
    }

    private void HandleOpenExternal(string requestId, string? url)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? uri) ||
                uri.Scheme is not ("http" or "https"))
            {
                throw new ArgumentException("Only http and https links can be opened.");
            }

            Process.Start(new ProcessStartInfo(uri.ToString())
            {
                UseShellExecute = true
            });

            PostFlexResponse(new
            {
                type = "app.openExternalResult",
                requestId,
                ok = true
            });
        }
        catch (Exception error)
        {
            PostFlexResponse(new
            {
                type = "app.openExternalResult",
                requestId,
                ok = false,
                error = error.Message
            });
        }
    }

    private void PostFlexResponse(object payload)
    {
        string json = System.Text.Json.JsonSerializer.Serialize(
            payload,
            new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });
        webView.CoreWebView2.PostWebMessageAsJson(json);
    }

    private static string ResolveContentRoot()
    {
        string publishedRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (File.Exists(Path.Combine(publishedRoot, "index.html")))
        {
            return publishedRoot;
        }

        string devRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        if (File.Exists(Path.Combine(devRoot, "index.html")))
        {
            return devRoot;
        }

        throw new DirectoryNotFoundException("Could not find the offline app content folder.");
    }

    private void ApplyNativeWindowTheme()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        try
        {
            if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 17763))
            {
                int enabled = 1;
                _ = DwmSetWindowAttribute(Handle, DwmWindowAttribute.UseImmersiveDarkMode, ref enabled, Marshal.SizeOf<int>());
            }

            if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
            {
                int captionColor = ToColorRef(AppBackground);
                int borderColor = ToColorRef(AppBorder);
                int textColor = ToColorRef(AppText);
                _ = DwmSetWindowAttribute(Handle, DwmWindowAttribute.CaptionColor, ref captionColor, Marshal.SizeOf<int>());
                _ = DwmSetWindowAttribute(Handle, DwmWindowAttribute.BorderColor, ref borderColor, Marshal.SizeOf<int>());
                _ = DwmSetWindowAttribute(Handle, DwmWindowAttribute.TextColor, ref textColor, Marshal.SizeOf<int>());
            }
        }
        catch
        {
            // The app still works normally on Windows builds that do not expose these DWM attributes.
        }
    }

    private static int ToColorRef(Color color)
    {
        return color.R | (color.G << 8) | (color.B << 16);
    }

    private static class DwmWindowAttribute
    {
        public const int UseImmersiveDarkMode = 20;
        public const int BorderColor = 34;
        public const int CaptionColor = 35;
        public const int TextColor = 36;
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int attributeValue, int attributeSize);
}
