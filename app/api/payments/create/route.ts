import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();
    if (!orderId) return NextResponse.json({ error: "orderId es obligatorio" }, { status: 400 });
    // TODO: Implementar pasarela de pago
    return NextResponse.json({ message: "Pendiente de implementar", orderId });
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
