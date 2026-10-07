using System.Net;
using System.Text.Json;
using System.Xml.Linq;

namespace IBKRAnalyticsStudio.WebView2;

public sealed class FlexApiClient
{
    private const string BaseUrl = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromSeconds(4),
        TimeSpan.FromSeconds(8),
        TimeSpan.FromSeconds(12),
        TimeSpan.FromSeconds(16)
    ];

    private readonly HttpClient httpClient;

    public FlexApiClient(HttpClient httpClient)
    {
        this.httpClient = httpClient;
    }

    public async Task<FlexFetchResult> FetchReportAsync(string token, string queryId, string start, string end, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new ArgumentException("Flex Web Service token is required.", nameof(token));
        }

        if (string.IsNullOrWhiteSpace(queryId))
        {
            throw new ArgumentException("Flex Query ID is required.", nameof(queryId));
        }

        string referenceCode = await SendRequestAsync(token.Trim(), queryId.Trim(), start, end, cancellationToken);
        return await GetStatementWithRetryAsync(token.Trim(), referenceCode, cancellationToken);
    }

    private async Task<string> SendRequestAsync(string token, string queryId, string start, string end, CancellationToken cancellationToken)
    {
        if (!DateOnly.TryParseExact(start, "yyyy-MM-dd", out var first) ||
            !DateOnly.TryParseExact(end, "yyyy-MM-dd", out var last) || first > last)
            throw new ArgumentException("Invalid Flex report date range.");
        Uri requestUri = new(BuildUri("/SendRequest", token, queryId).AbsoluteUri +
            $"&fd={first:yyyyMMdd}&td={last:yyyyMMdd}");
        using HttpResponseMessage response = await httpClient.GetAsync(requestUri, cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new FlexApiException($"IBKR SendRequest failed with HTTP {(int)response.StatusCode} {response.StatusCode}.");
        }

        FlexXmlStatus status = ParseFlexStatus(body);
        if (!status.IsSuccess || string.IsNullOrWhiteSpace(status.ReferenceCode))
        {
            throw new FlexApiException(status.ToUserMessage("IBKR could not generate the Flex report."));
        }

        return status.ReferenceCode;
    }

    private async Task<FlexFetchResult> GetStatementWithRetryAsync(string token, string referenceCode, CancellationToken cancellationToken)
    {
        for (int attempt = 0; attempt <= RetryDelays.Length; attempt += 1)
        {
            Uri requestUri = BuildUri("/GetStatement", token, referenceCode);
            using HttpResponseMessage response = await httpClient.GetAsync(requestUri, cancellationToken);
            byte[] bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            string body = DecodeReport(bytes, response.Content.Headers.ContentType?.CharSet);

            if (response.IsSuccessStatusCode && !LooksLikeFlexStatus(body))
            {
                return new FlexFetchResult(
                    body,
                    response.Content.Headers.ContentType?.MediaType ?? "text/plain",
                    referenceCode);
            }

            FlexXmlStatus status = LooksLikeFlexStatus(body)
                ? ParseFlexStatus(body)
                : new FlexXmlStatus(false, "", ((int)response.StatusCode).ToString(), response.StatusCode.ToString());

            if (!ShouldRetry(status, response.StatusCode) || attempt == RetryDelays.Length)
            {
                throw new FlexApiException(status.ToUserMessage("IBKR could not retrieve the generated Flex report."));
            }

            await Task.Delay(RetryDelays[attempt], cancellationToken);
        }

        throw new FlexApiException("IBKR report generation did not complete in time. Please try again shortly.");
    }

    private static Uri BuildUri(string path, string token, string code)
    {
        string url =
            $"{BaseUrl}{path}?t={Uri.EscapeDataString(token)}&q={Uri.EscapeDataString(code)}&v=3";
        return new Uri(url);
    }

    private static string DecodeReport(byte[] bytes, string? charset)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf)
        {
            return System.Text.Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        }

        if (!string.IsNullOrWhiteSpace(charset))
        {
            try
            {
                return System.Text.Encoding.GetEncoding(charset).GetString(bytes);
            }
            catch
            {
                // Fall back to UTF-8; IBKR reports are usually UTF-8 compatible.
            }
        }

        return System.Text.Encoding.UTF8.GetString(bytes);
    }

    private static bool LooksLikeFlexStatus(string body)
    {
        string text = body.TrimStart();
        return text.StartsWith("<FlexStatementResponse", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("<?xml", StringComparison.OrdinalIgnoreCase) && text.Contains("<FlexStatementResponse", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ShouldRetry(FlexXmlStatus status, HttpStatusCode statusCode)
    {
        if ((int)statusCode >= 500) return true;

        return status.ErrorCode is "1001" or "1003" or "1004" or "1005" or "1006" or "1007" or "1008" or "1009" or "1019" or "1021";
    }

    private static FlexXmlStatus ParseFlexStatus(string xml)
    {
        try
        {
            XDocument document = XDocument.Parse(xml);
            XElement root = document.Root ?? throw new FlexApiException("IBKR returned an empty XML response.");
            string status = root.Element("Status")?.Value.Trim() ?? "";
            string referenceCode = root.Element("ReferenceCode")?.Value.Trim() ?? "";
            string errorCode = root.Element("ErrorCode")?.Value.Trim() ?? "";
            string errorMessage = root.Element("ErrorMessage")?.Value.Trim() ?? "";

            return new FlexXmlStatus(
                status.Equals("Success", StringComparison.OrdinalIgnoreCase),
                referenceCode,
                errorCode,
                errorMessage);
        }
        catch (FlexApiException)
        {
            throw;
        }
        catch (Exception error)
        {
            throw new FlexApiException($"IBKR returned an unreadable XML response. {error.Message}");
        }
    }
}

public sealed record FlexFetchResult(string ReportText, string ContentType, string ReferenceCode);

public sealed class FlexApiException : Exception
{
    public FlexApiException(string message) : base(message)
    {
    }
}

public sealed record FlexBridgeRequest(string? Type, string? RequestId, string? Token, string? QueryId, string? Url, string? Start, string? End)
{
    public static FlexBridgeRequest? TryParse(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<FlexBridgeRequest>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }
}

internal sealed record FlexXmlStatus(bool IsSuccess, string ReferenceCode, string ErrorCode, string ErrorMessage)
{
    public string ToUserMessage(string fallback)
    {
        if (!string.IsNullOrWhiteSpace(ErrorCode) || !string.IsNullOrWhiteSpace(ErrorMessage))
        {
            return $"IBKR Flex error {ErrorCode}: {ErrorMessage}".Trim();
        }

        return fallback;
    }
}
