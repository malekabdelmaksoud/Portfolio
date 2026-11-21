import json
import platform
import sys


def system_ram_gb():
    try:
        import psutil
        return round(psutil.virtual_memory().total / (1024 ** 3), 2)
    except Exception:
        if sys.platform.startswith("win"):
            import ctypes
            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_physical", ctypes.c_ulonglong),
                    ("available_physical", ctypes.c_ulonglong),
                    ("total_page", ctypes.c_ulonglong),
                    ("available_page", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("available_virtual", ctypes.c_ulonglong),
                    ("available_extended_virtual", ctypes.c_ulonglong),
                ]
            status = MemoryStatus()
            status.length = ctypes.sizeof(status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                return round(status.total_physical / (1024 ** 3), 2)
        try:
            with open("/proc/meminfo", "r", encoding="ascii") as handle:
                for line in handle:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return round(kb / (1024 ** 2), 2)
        except Exception:
            pass
    return None


def main():
    result = {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "ram_gb": system_ram_gb(),
        "torch": None,
        "cuda_available": False,
        "cuda_runtime": None,
        "gpu_name": None,
        "gpu_vram_gb": None,
    }
    try:
        import torch
        result["torch"] = torch.__version__
        result["cuda_available"] = torch.cuda.is_available()
        result["cuda_runtime"] = torch.version.cuda
        if torch.cuda.is_available():
            result["gpu_name"] = torch.cuda.get_device_name(0)
            result["gpu_vram_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2)
    except Exception as exc:
        result["torch_error"] = f"{type(exc).__name__}: {exc}"

    vram = result["gpu_vram_gb"]
    if result["cuda_available"] and vram is not None:
        if vram >= 6:
            context, batch, accumulation = 256, 1, 4
        elif vram >= 4:
            context, batch, accumulation = 128, 1, 1
        else:
            context, batch, accumulation = 96, 1, 1
    else:
        context, batch, accumulation = 64, 1, 1

    result["recommended_smoke"] = {
        "context": context,
        "batch_size": batch,
        "gradient_accumulation": accumulation,
        "mixed_precision": bool(result["cuda_available"]),
        "device": "cuda" if result["cuda_available"] else "cpu",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
