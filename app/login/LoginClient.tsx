"use client";

import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "register") setIsRegister(true);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    if (!email.trim()) return toast.error("Introduce tu email");
    if (!password || password.length < 6) return toast.error("La contraseña debe tener mínimo 6 caracteres");
    if (isRegister && !name.trim()) return toast.error("Introduce tu nombre");

    try {
      setLoading(true);

      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        toast.success("Cuenta creada correctamente");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success("Sesión iniciada");
      }

      router.push(redirect);
    } catch (error: unknown) {
      const fb = error as FirebaseError;
      const code = typeof fb?.code === "string" ? fb.code : "";

      const msg =
        code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Email o contraseña incorrectos"
          : code === "auth/email-already-in-use"
          ? "Ya existe una cuenta con ese email"
          : code === "auth/invalid-email"
          ? "Email inválido"
          : code === "auth/weak-password"
          ? "La contraseña es demasiado débil"
          : code === "auth/too-many-requests"
          ? "Demasiados intentos. Espera un momento y vuelve a probar."
          : "Error al autenticar";

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{isRegister ? "Crear cuenta" : "Iniciar sesión"}</h1>
        <p className="text-sm text-gray-500">
          {isRegister ? "Regístrate para pedir desde tu móvil." : "Entra para ver tu carrito y tus pedidos."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister && (
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
              placeholder="Tu nombre"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            placeholder="tu@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            placeholder="Mínimo 6 caracteres"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Cargando..." : isRegister ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <button
        onClick={() => setIsRegister(!isRegister)}
        className="block w-full text-center text-sm text-gray-500 underline"
      >
        {isRegister ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
      </button>
    </div>
  );
}
