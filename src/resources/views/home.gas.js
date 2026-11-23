@extends('layouts.app')

@section('title', 'Beranda - ' + appName)

@section('content')
    @if (typeof success !== 'undefined' && success)
        <div style="background:#dcfce7; border:1px solid #86efac; color:#166534; padding:12px 14px; border-radius:8px; margin-bottom:16px;">
            {{ success }}
        </div>
    @endif

    @if (typeof errorMessage !== 'undefined' && errorMessage)
        <div style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:12px 14px; border-radius:8px; margin-bottom:16px;">
            {{ errorMessage }}
        </div>
    @endif

    <div style="display:flex; justify-content:space-between; align-items:center;">
        <h1 style="margin:0;">Selamat datang, {{ user.name }}</h1>
        <a href="{{ route('users.create') }}" style="background:#2563eb; color:#fff; text-decoration:none; padding:8px 14px; border-radius:8px; font-weight:600;">
            + Tambah User
        </a>
    </div>

    <p>Endpoint API Users: <code>{{ apiUrl('/users') }}</code></p>

    <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:10px;">
        @forelse (items as item)
            <li style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px;">
                <div>
                    {{ loop.iteration }}.
                    <strong>{{ item.name || item.username || 'User #' + item.id }}</strong>
                    @if (item.email)
                        <span style="color:#64748b;">— {{ item.email }}</span>
                    @endif
                </div>

                <div style="display:flex; gap:8px; align-items:center;">
                    <a
                        href="{{ route('users.edit', { id: item.id }) }}"
                        style="background:#f59e0b; color:#fff; text-decoration:none; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600;"
                    >
                        Edit
                    </a>

                    <form
                        method="POST"
                        action="{{ route('users.destroy', { id: item.id }) }}"
                        onsubmit="return confirm('Yakin ingin menghapus user ini?');"
                        style="margin:0;"
                    >
                        @csrf
                        <input type="hidden" name="_method" value="DELETE">
                        <button
                            type="submit"
                            style="background:#dc2626; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;"
                        >
                            Hapus
                        </button>
                    </form>
                </div>
            </li>
        @empty
            <li>Belum ada data user.</li>
        @endforelse
    </ul>
@endsection
