"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        toast.success("Cuenta creada correctamente");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Sesión iniciada");
      }
      router.push(redirect);
    } catch (error: any) {
      const msg = error.code === "auth/wrong-password" || error.code === "auth/user-not-found"
        ? "Email o contraseña incorrectos"
        : error.code === "auth/email-already-in-use"
        ? "Ya existe una cuenta con ese email"
        : "Error al iniciar sesión";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <div className="text-center">
        <p className="text-3xl mb-2">☕</p>
        <h1 className="text-2xl font-bold text-brand-900">{isRegister ? "Crear cuenta" : "Iniciar sesión"}</h1>
        <p className="text-sm text-brand-500">{isRegister ? "Regístrate para hacer pedidos" : "Entra con tu cuenta para pedir"}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister && (
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-800">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2.5 text-sm text-brand-900 outline-none focus:ring-2 focus:ring-leaf-500 placeholder:text-brand-400" placeholder="Tu nombre" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-800">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2.5 text-sm text-brand-900 outline-none focus:ring-2 focus:ring-leaf-500 placeholder:text-brand-400" placeholder="tu@email.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-800">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2.5 text-sm text-brand-900 outline-none focus:ring-2 focus:ring-leaf-500 placeholder:text-brand-400" placeholder="Mínimo 6 caracteres" />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-leaf-600 py-3 text-sm font-medium text-white transition-colors hover:bg-leaf-700 disabled:opacity-50">
          {loading ? "Cargando..." : isRegister ? "Crear cuenta" : "Entrar"}
        </button>
      </form>
      <button onClick={() => setIsRegister(!isRegister)} className="block w-full text-center text-sm text-brand-500 underline hover:text-brand-700">
        {isRegister ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
      </button>
    </div>
  );
}
