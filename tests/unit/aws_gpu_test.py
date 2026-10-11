import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile

spec = importlib.util.spec_from_file_location('aws_gpu', Path(__file__).parents[2] / 'scripts/aws_gpu.py')
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)


class LeaseTests(unittest.TestCase):
    def test_termination_is_scoped_to_the_new_project_lease(self):
        policy = gpu.termination_policy('518890435259', 'us-east-1', 'lease-test')
        statement = policy['Statement'][0]
        self.assertEqual(statement['Action'], 'ec2:TerminateInstances')
        self.assertEqual(statement['Condition']['StringEquals']['ec2:ResourceTag/DTILease'], 'lease-test')
        self.assertEqual(statement['Resource'], 'arn:aws:ec2:us-east-1:518890435259:instance/*')

    def test_utc_expiry_is_exactly_one_day_after_launch(self):
        self.assertEqual(gpu.expiry_for('2026-10-11T20:00:00Z'), '2026-10-12T20:00:00Z')

    def test_schedule_targets_only_the_new_instance_and_deletes_itself(self):
        schedule = gpu.schedule_spec('dti2irl-test', 'i-0123456789abcdef0', 'arn:aws:iam::518890435259:role/test', '2026-10-12T20:00:00Z')
        self.assertEqual(schedule['Target']['Arn'], 'arn:aws:scheduler:::aws-sdk:ec2:terminateInstances')
        self.assertEqual(schedule['Target']['Input'], '{"InstanceIds":["i-0123456789abcdef0"]}')
        self.assertEqual(schedule['ActionAfterCompletion'], 'DELETE')
        self.assertEqual(schedule['ScheduleExpressionTimezone'], 'UTC')
        self.assertEqual(schedule['FlexibleTimeWindow'], {'Mode': 'OFF'})

    def test_failed_schedule_retries_and_verifies_compensating_termination(self):
        attempts = []
        def aws(service, operation, *args):
            if operation == 'terminate-instances':
                attempts.append(operation)
                if len(attempts) == 1: raise RuntimeError('transient failure')
            if operation == 'describe-instances':
                return {'Reservations': [{'Instances': [{'State': {'Name': 'terminated'}}]}]}
            return {}
        with tempfile.TemporaryDirectory() as path, patch.object(gpu.time, 'sleep'):
            data = {'instance_id': 'i-new'}
            gpu.terminate_unverified(aws, Path(path) / 'lease.json', data)
            self.assertEqual(len(attempts), 2)
            self.assertTrue(data['terminated_fail_closed'])
            self.assertFalse(data['needs_termination'])

    def test_unresolved_termination_is_persisted_for_recovery(self):
        def aws(*args): raise RuntimeError('AWS offline')
        with tempfile.TemporaryDirectory() as path, patch.object(gpu.time, 'sleep'):
            manifest = Path(path) / 'lease.json'
            with self.assertRaisesRegex(RuntimeError, 'i-new'):
                gpu.terminate_unverified(aws, manifest, {'instance_id': 'i-new'})
            import json
            saved = json.loads(manifest.read_text())
            self.assertTrue(saved['needs_termination'])
            self.assertFalse(saved.get('terminated_fail_closed', False))


if __name__ == '__main__':
    unittest.main()
