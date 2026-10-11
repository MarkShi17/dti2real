"""Provision one dedicated GPU with a verified, fail-closed 24-hour lease.

Run: python3 scripts/aws_gpu.py provision --profile oasis-prod
The private key and manifest stay in ignored .cache/tryon-3d/gpu (mode 0600).
Existing instances are never selected, stopped, or modified.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.cache/tryon-3d/gpu'


def termination_policy(account, region, lease):
    return {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Action': 'ec2:TerminateInstances',
        'Resource': f'arn:aws:ec2:{region}:{account}:instance/*',
        'Condition': {'StringEquals': {'ec2:ResourceTag/DTILease': lease}},
    }]}


def expiry_for(launched):
    return (datetime.fromisoformat(launched.replace('Z', '+00:00')) + timedelta(hours=24)).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def schedule_spec(name, instance, role, expiry):
    return {'Name': name, 'ScheduleExpression': f'at({expiry.rstrip("Z")})',
            'ScheduleExpressionTimezone': 'UTC', 'FlexibleTimeWindow': {'Mode': 'OFF'},
            'ActionAfterCompletion': 'DELETE',
            'Target': {'Arn': 'arn:aws:scheduler:::aws-sdk:ec2:terminateInstances',
                       'RoleArn': role, 'Input': json.dumps({'InstanceIds': [instance]}, separators=(',', ':')),
                       'RetryPolicy': {'MaximumEventAgeInSeconds': 300, 'MaximumRetryAttempts': 3}}}


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')
    path.chmod(0o600)


def terminate_unverified(aws, manifest, data):
    """Persist recovery information before retrying a failed lease's cleanup."""
    instance = data['instance_id']
    data['needs_termination'] = True
    save(manifest, data)
    for attempt in range(8):
        try:
            aws('ec2', 'terminate-instances', '--instance-ids', instance)
            aws('ec2', 'wait', 'instance-terminated', '--instance-ids', instance)
            live = aws('ec2', 'describe-instances', '--instance-ids', instance)['Reservations'][0]['Instances'][0]
            if live['State']['Name'] != 'terminated':
                raise RuntimeError('Instance termination was not verified')
            data.update(terminated_fail_closed=True, needs_termination=False)
            data.pop('termination_error', None)
            save(manifest, data)
            return
        except Exception as error:
            data['termination_error'] = str(error)
            save(manifest, data)
            if attempt < 7:
                time.sleep(min(2 ** attempt, 15))
    raise RuntimeError(f'Failed lease {instance} still needs termination. Recovery details are persisted in {manifest}')


def provision(args):
    STATE.mkdir(parents=True, exist_ok=True)
    STATE.chmod(0o700)
    manifest = STATE / 'lease.json'
    previous = None
    if manifest.exists():
        previous = json.loads(manifest.read_text())
        if previous.get('instance_id') and previous.get('schedule_verified'):
            print(json.dumps({k: previous[k] for k in ('instance_id', 'expires_at', 'public_ip', 'schedule_name')}))
            return
        if previous.get('needs_termination'):
            def recovery_aws(service, operation, *params):
                command = ['aws', '--profile', previous['profile'], '--region', previous['region'], service, operation, *params, '--output', 'json', '--no-cli-pager']
                result = subprocess.run(command, text=True, capture_output=True)
                if result.returncode:
                    raise RuntimeError(result.stderr.strip())
                return json.loads(result.stdout) if result.stdout.strip() else {}
            terminate_unverified(recovery_aws, manifest, previous)
        if previous.get('instance_id'):
            raise RuntimeError('An incomplete instance lease exists; inspect it before creating another GPU.')

    def aws(service, operation, *params):
        command = ['aws', '--profile', args.profile, '--region', args.region, service, operation, *params, '--output', 'json', '--no-cli-pager']
        result = subprocess.run(command, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout) if result.stdout.strip() else {}

    account = aws('sts', 'get-caller-identity')['Account']
    with urllib.request.urlopen('https://checkip.amazonaws.com', timeout=15) as response:
        address = str(ipaddress.IPv4Address(response.read().decode().strip()))
    lease = previous['lease'] if previous else 'dti2irl-' + uuid.uuid4().hex[:12]
    role = lease + '-expiry'
    group_arn = f'arn:aws:scheduler:{args.region}:{account}:schedule-group/default'
    trust = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'scheduler.amazonaws.com'}, 'Action': 'sts:AssumeRole', 'Condition': {'StringEquals': {'aws:SourceAccount': account}, 'ArnLike': {'aws:SourceArn': group_arn}}}]}
    role_arn = f'arn:aws:iam::{account}:role/{role}'
    key = STATE / 'id_ed25519'
    if previous and previous['region'] == args.region:
        security_group = previous['security_group']
    else:
        if previous:
            aws('iam', 'update-assume-role-policy', '--role-name', role, '--policy-document', json.dumps(trust))
        else:
            role_arn = aws('iam', 'create-role', '--role-name', role, '--assume-role-policy-document', json.dumps(trust), '--tags', 'Key=Project,Value=DTI2IRL', f'Key=DTILease,Value={lease}')['Role']['Arn']
        aws('iam', 'put-role-policy', '--role-name', role, '--policy-name', 'TerminateDedicatedLeaseOnly', '--policy-document', json.dumps(termination_policy(account, args.region, lease)))
        if not key.exists():
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key), '-C', lease], check=True)
        key.chmod(0o600)
        aws('ec2', 'import-key-pair', '--key-name', lease, '--public-key-material', 'fileb://' + str(key) + '.pub')
        security_group = aws('ec2', 'create-security-group', '--group-name', lease, '--description', 'DTI2IRL temporary GPU: SSH from provisioner only', '--vpc-id', args.vpc)['GroupId']
        aws('ec2', 'create-tags', '--resources', security_group, '--tags', 'Key=Project,Value=DTI2IRL', f'Key=DTILease,Value={lease}')
        aws('ec2', 'authorize-security-group-ingress', '--group-id', security_group, '--protocol', 'tcp', '--port', '22', '--cidr', address + '/32')
    data = {'lease': lease, 'profile': args.profile, 'region': args.region, 'account': account,
            'security_group': security_group, 'ssh_cidr': address + '/32', 'key_name': lease, 'role_name': role,
            'schedule_name': lease, 'schedule_verified': False, 'instance_type': args.instance_type}
    if previous and previous['region'] != args.region:
        data['unused_regional_resources'] = {'region': previous['region'], 'security_group': previous['security_group'], 'key_name': previous['key_name']}
    save(manifest, data)
    instance_id = None
    try:
        result = aws('ec2', 'run-instances', '--image-id', args.ami, '--instance-type', args.instance_type, '--count', '1', '--key-name', lease,
                     *([] if args.subnet == 'auto' else ['--subnet-id', args.subnet]), '--security-group-ids', security_group,
                     '--metadata-options', 'HttpTokens=required,HttpEndpoint=enabled',
                     '--block-device-mappings', json.dumps([{'DeviceName': '/dev/sda1', 'Ebs': {'VolumeSize': 200, 'VolumeType': 'gp3', 'Encrypted': True, 'DeleteOnTermination': True}}]),
                     '--tag-specifications', json.dumps([{'ResourceType': kind, 'Tags': [{'Key': 'Name', 'Value': lease}, {'Key': 'Project', 'Value': 'DTI2IRL'}, {'Key': 'DTILease', 'Value': lease}]} for kind in ('instance', 'volume')]))
        instance = result['Instances'][0]
        instance_id = instance['InstanceId']
        data.update(instance_id=instance_id, launched_at=instance['LaunchTime'], expires_at=expiry_for(instance['LaunchTime']))
        save(manifest, data)
        specification = schedule_spec(lease, instance_id, role_arn, data['expires_at'])
        spec_path = STATE / 'schedule.json'
        save(spec_path, specification)
        # New IAM roles take a few seconds to propagate to Scheduler.
        for attempt in range(15):
            try:
                aws('scheduler', 'create-schedule', '--cli-input-json', 'file://' + str(spec_path))
                break
            except RuntimeError:
                if attempt == 14:
                    raise
                time.sleep(2)
        verified = aws('scheduler', 'get-schedule', '--name', lease)
        if any(verified.get(field) != specification[field] for field in ('ScheduleExpression', 'ScheduleExpressionTimezone', 'FlexibleTimeWindow', 'ActionAfterCompletion')) or verified['Target']['Input'] != specification['Target']['Input'] or verified['Target']['RoleArn'] != role_arn or verified['State'] != 'ENABLED':
            raise RuntimeError('Termination schedule verification failed')
        data['schedule_verified'] = True
        save(manifest, data)
        aws('ec2', 'wait', 'instance-running', '--instance-ids', instance_id)
        live = aws('ec2', 'describe-instances', '--instance-ids', instance_id)['Reservations'][0]['Instances'][0]
        data['public_ip'] = live['PublicIpAddress']
        save(manifest, data)
        print(json.dumps({k: data[k] for k in ('instance_id', 'expires_at', 'public_ip', 'schedule_name')}))
    except BaseException:
        if instance_id and not data.get('schedule_verified'):
            terminate_unverified(aws, manifest, data)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['provision'])
    parser.add_argument('--profile', default='oasis-prod')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--vpc', default='vpc-0cffb89b0da0e8b92')
    parser.add_argument('--subnet', default='subnet-0f95a994eb2be41d0')
    parser.add_argument('--ami', default='ami-0d80e0723483d86f6')
    parser.add_argument('--instance-type', choices=['g6e.2xlarge', 'g6e.xlarge'], default='g6e.2xlarge')
    provision(parser.parse_args())
