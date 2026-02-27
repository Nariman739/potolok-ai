import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Link href="/" className="mb-8">
        <Logo size="lg" variant="dark" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
