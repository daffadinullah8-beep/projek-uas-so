import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SERVER_PATH = Path(__file__).resolve().parents[1] / "server" / "server.py"
SPEC = importlib.util.spec_from_file_location("aether_test_server", SERVER_PATH)
backend = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = backend
SPEC.loader.exec_module(backend)


def io_counters(read_bytes, write_bytes, read_count, write_count, read_time, write_time):
    return {
        "PhysicalDrive0": SimpleNamespace(
            read_bytes=read_bytes,
            write_bytes=write_bytes,
            read_count=read_count,
            write_count=write_count,
            read_time=read_time,
            write_time=write_time,
        )
    }


GPU = {
    "gT": None, "gW": None, "gClk": None, "gMemClk": None, "gClkMax": None,
    "gU": None, "gMU": None, "vram": None, "vramTot": None, "gLim": None,
    "gLimDef": None, "pstate": None, "thr": None, "fan": None, "pcieGen": None,
    "pcieWidth": None, "pcieMax": None, "vbw": None, "prx": None, "ptx": None,
    "pcu": None, "gbw": None, "gpeak": None, "pctheory": None, "thrIdle": None,
    "thrPower": None, "thrThermal": None, "thrHw": None, "name": None,
}


class WindowsSnapshotTests(unittest.TestCase):
    def setUp(self):
        backend._state.clear()
        backend._health.clear()
        backend._last_t = None
        backend._win_cpu_ready = False

    def test_snapshot_uses_real_common_windows_counters(self):
        hardware = {
            "cpuModel": "Test CPU",
            "manufacturer": "Test Manufacturer",
            "deviceModel": "Test Laptop",
            "gpuNames": ["Test GPU"],
            "disks": [{
                "DeviceID": r"\\.\PHYSICALDRIVE0",
                "Model": "Test SSD",
                "Size": "1000000000000",
            }],
        }
        cpu_samples = iter(([0.0, 0.0], [25.0, 75.0]))
        cpu_stats = iter((
            SimpleNamespace(ctx_switches=100, interrupts=20),
            SimpleNamespace(ctx_switches=130, interrupts=30),
        ))
        disk_samples = iter((
            io_counters(1_000, 2_000, 10, 20, 100, 200),
            io_counters(2_001_000, 1_002_000, 11, 21, 120, 240),
        ))
        with (
            patch.object(backend.platform, "system", return_value="Windows"),
            patch.object(backend.platform, "win32_ver", return_value=("11", "10.0.1", "", "AMD64")),
            patch.object(backend, "windows_system_info", return_value=(hardware, None)),
            patch.object(backend, "gpu_metrics", return_value=GPU),
            patch.object(backend.psutil, "cpu_percent", side_effect=lambda **_: next(cpu_samples)),
            patch.object(backend.psutil, "cpu_freq", return_value=[
                SimpleNamespace(current=2500, max=3500), SimpleNamespace(current=3000, max=4000),
            ]),
            patch.object(backend.psutil, "cpu_stats", side_effect=lambda: next(cpu_stats)),
            patch.object(backend.psutil, "virtual_memory", return_value=SimpleNamespace(
                total=8 * 1024**3, available=3 * 1024**3,
            )),
            patch.object(backend.psutil, "swap_memory", return_value=SimpleNamespace(
                total=2 * 1024**3, used=512 * 1024**2,
            )),
            patch.object(backend.psutil, "disk_io_counters", side_effect=lambda **_: next(disk_samples)),
        ):
            first = backend.build_windows_snapshot(None)
            second = backend.build_windows_snapshot(1.0)

        self.assertIsNone(first["cpuU"])
        self.assertEqual(second["cpuU"], 50.0)
        self.assertEqual(second["pu"], [25.0, 75.0])
        self.assertEqual(second["pfa"], 2.75)
        self.assertEqual(second["pfaMax"], 4.0)
        self.assertEqual(second["ramU"], 5.0)
        self.assertEqual(second["memTot"], 8.0)
        self.assertEqual(second["swapU"], 0.5)
        self.assertEqual(second["r0"], 2.0)
        self.assertEqual(second["w0"], 1.0)
        self.assertEqual(second["i0"], 2.0)
        self.assertEqual(second["a0"], 30.0)
        self.assertEqual(second["drives"][0]["name"], "Test SSD")
        self.assertEqual(second["drives"][0]["sizeGB"], 1000.0)
        self.assertEqual(second["snap"]["platform"], "Windows")
        self.assertEqual(second["snap"]["cpuCoreType"], "logical")
        self.assertTrue(second["snap"]["gpuPresent"])
        self.assertIsNone(second["cpuT"])
        self.assertIn("tidak tersedia", backend._health["cpuT"])

    def test_windows_gpu_driver_uses_nvml_then_cim_fallback(self):
        hardware = {"gpuDrivers": ["32.0.15.7602"]}
        with (
            patch.object(backend.platform, "win32_ver", return_value=("11", "10.0.1", "", "AMD64")),
            patch.object(backend.psutil, "virtual_memory", return_value=SimpleNamespace(total=8 * 1024**3)),
            patch.object(backend, "windows_system_info", return_value=(hardware, None)),
            patch.object(backend, "NVML", True),
            patch.object(backend.pynvml, "nvmlSystemGetDriverVersion", return_value=b"610.47"),
        ):
            nvml_snapshot = backend.windows_system_snap()
        self.assertEqual(nvml_snapshot["gpuDriver"], "610.47")
        self.assertIsNone(nvml_snapshot["gpuDriverWarning"])

        with (
            patch.object(backend.platform, "win32_ver", return_value=("11", "10.0.1", "", "AMD64")),
            patch.object(backend.psutil, "virtual_memory", return_value=SimpleNamespace(total=8 * 1024**3)),
            patch.object(backend, "windows_system_info", return_value=(hardware, None)),
            patch.object(backend, "NVML", False),
        ):
            cim_snapshot = backend.windows_system_snap()
        self.assertEqual(cim_snapshot["gpuDriver"], "32.0.15.7602")

    def test_recording_metadata_and_csv_include_cross_platform_identity(self):
        backend._sessions[7] = {
            "label": "test", "tag": "Windows", "iv": 1, "start": 1_700_000_000_000,
            "status": "saved", "samples": 1, "markers": [],
            "config": {
                "platform": "Windows", "osName": "Windows 11", "osVersion": "10.0.1",
                "hostname": "test-host", "manufacturer": "Test", "deviceModel": "Laptop",
                "cpuModel": "Test CPU", "cpuLogical": 8, "cpuPhysical": 4,
                "memoryTotalGiB": 8, "gpuName": "Test GPU", "gpuDriver": "610.47",
            },
        }
        meta = backend._meta(7)
        self.assertEqual(meta["schema_version"], 2)
        self.assertEqual(meta["system"]["platform"], "Windows")
        self.assertEqual(meta["system"]["gpuDriver"], "610.47")
        self.assertIn("cpu_util_percent", meta["columns"])
        self.assertIn("gpu_util_percent", meta["columns"])
        self.assertIn("drive0_write_mbps", meta["columns"])
        backend._sessions.pop(7)


if __name__ == "__main__":
    unittest.main()
