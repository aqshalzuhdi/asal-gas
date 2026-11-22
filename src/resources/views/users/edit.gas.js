@extends('layouts.app')

@section('title', 'Edit User - ' + appName)

@section('content')
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h1 style="margin:0;">Edit User #{{ item.id }}</h1>
        <a href="{{ url('/index') }}" style="color:#475569; text-decoration:none;">&larr; Kembali</a>
    </div>

    @if (typeof errorMessage !== 'undefined' && errorMessage)
        <div style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:12px 14px; border-radius:8px; margin-bottom:16px;">
            {{ errorMessage }}
        </div>
    @endif

    <form method="POST" action="{{ route('users.update', { id: item.id }) }}" style="display:flex; flex-direction:column; gap:14px;">
        <input type="hidden" name="_method" value="PUT">

        <div>
            <label for="name" style="display:block; font-weight:600; margin-bottom:6px;">Nama</label>
            <input
                type="text"
                id="name"
                name="name"
                value="{{ (typeof old !== 'undefined' && old.name !== undefined) ? old.name : item.name }}"
                placeholder="Masukkan nama lengkap"
                style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px;"
            >
            @if (typeof errors !== 'undefined' && errors.name)
                <small style="color:#dc2626; display:block; margin-top:4px;">{{ errors.name[0] }}</small>
            @endif
        </div>

        <div>
            <label for="email" style="display:block; font-weight:600; margin-bottom:6px;">Email</label>
            <input
                type="email"
                id="email"
                name="email"
                value="{{ (typeof old !== 'undefined' && old.email !== undefined) ? old.email : item.email }}"
                placeholder="nama@domain.com"
                style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px;"
            >
            @if (typeof errors !== 'undefined' && errors.email)
                <small style="color:#dc2626; display:block; margin-top:4px;">{{ errors.email[0] }}</small>
            @endif
        </div>

        <div>
            <label for="password" style="display:block; font-weight:600; margin-bottom:6px;">Password Baru <span style="font-weight:400; color:#64748b;">(opsional)</span></label>
            <input
                type="password"
                id="password"
                name="password"
                placeholder="Kosongkan jika tidak ingin mengubah password"
                style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px;"
            >
            @if (typeof errors !== 'undefined' && errors.password)
                <small style="color:#dc2626; display:block; margin-top:4px;">{{ errors.password[0] }}</small>
            @endif
        </div>

        <div style="display:flex; gap:10px; margin-top:6px;">
            <button
                type="submit"
                style="background:#2563eb; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:600; cursor:pointer;"
            >
                Update User
            </button>
            <a
                href="{{ url('/index') }}"
                style="background:#e2e8f0; color:#1e293b; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:600;"
            >
                Batal
            </a>
        </div>
    </form>
@endsection
