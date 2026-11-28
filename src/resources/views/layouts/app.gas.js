<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', appName)</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
            margin: 0;
            padding: 20px 16px;
            background: #f1f5f9;
            color: #0f172a;
            line-height: 1.5;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            padding: 24px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
        }
        nav {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
            padding-bottom: 14px;
            border-bottom: 1px solid #e2e8f0;
        }
        nav a {
            text-decoration: none;
            color: #2563eb;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 6px;
        }
        nav a:hover {
            background: #eff6ff;
        }
    </style>
    @stack('styles')
</head>
<body>
    <div class="container">
        <nav>
            <a href="{{ url('/') }}">Home</a>
            <a href="{{ url('/index') }}">Index</a>
        </nav>

        @yield('content')
    </div>

    <script>
        window.APP_CONFIG = {
            baseUrl: "{{ url('/') }}",
            apiBaseUrl: "{{ apiUrl('/') }}"
        };
    </script>
    @stack('scripts')
</body>
</html>
