export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    </div>
  );
}