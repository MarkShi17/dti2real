import importlib.util
import sys
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gpu_worker', Path(__file__).with_name('app.py'))
worker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = worker
spec.loader.exec_module(worker)


class ReadinessTests(unittest.TestCase):
    def test_main_weights_alone_are_not_ready(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'FASHN_WEIGHTS_DIR': directory}):
            Path(directory, 'model.safetensors').touch()
            health = worker.health()
            self.assertFalse(health['tryon']['ready'])
            self.assertIn('cuda_available', health)

    def test_no_cuda_means_no_inference(self):
        with patch.object(worker, 'cuda_available', return_value=False):
            self.assertFalse(worker.health()['tryon']['ready'])

    def test_pose_requires_authentication_before_inference(self):
        from fastapi.testclient import TestClient
        with TestClient(worker.app) as client:
            response = client.post('/pose', json={'wardrobe_image': 'a', 'identity_image': 'b', 'pose_image': 'c', 'pose': 'hip', 'pose_prompt': 'hand on hip'})
        self.assertEqual(response.status_code, 401)

    def test_expiry_disables_both_models_even_with_complete_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('model.safetensors', 'dwpose/yolox_l.onnx', 'dwpose/dw-ll_ucoco_384.onnx', '.prepared', 'model_index.json'):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
            with patch.object(worker, 'cuda_available', return_value=True), patch.dict(os.environ, {'FASHN_WEIGHTS_DIR': directory, 'POSE_WEIGHTS_DIR': directory, 'GPU_EXPIRES_AT': '2000-01-01T00:00:00Z'}):
                result = worker.health()
            for kind in ('tryon', 'pose'):
                self.assertFalse(result[kind]['ready'])
                self.assertEqual(result[kind]['reason'], 'lease_expired')


if __name__ == '__main__':
    unittest.main()
