<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', appName)</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
        nav { display: flex; gap: 16px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
        nav a { text-decoration: none; color: #2563eb; font-weight: 600; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 10px; border: 1px solid #e2e8f0; }
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
