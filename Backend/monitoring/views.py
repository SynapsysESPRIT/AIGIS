from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib.auth.models import User
from .models import ParentProfile, ChildProfile, ActivityLog, DetectionLog
from django.views.decorators.csrf import csrf_exempt
import json
from django.db.models import Count, Avg
from datetime import datetime, timedelta
from django.utils import timezone

@csrf_exempt
def login_view(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            password = data.get('password')
            user = authenticate(request, username=username, password=password)
            
            if user is not None:
                login(request, user)
                return JsonResponse({'status': 'success', 'message': 'Login successful'})
            return JsonResponse({'status': 'error', 'message': 'Invalid credentials'}, status=401)
        except json.JSONDecodeError:
            # Handle regular form submission
            username = request.POST.get('username')
            password = request.POST.get('password')
            user = authenticate(request, username=username, password=password)
            
            if user is not None:
                login(request, user)
                next_url = request.GET.get('next', '/monitoring/')
                return redirect(next_url)
            return render(request, 'monitoring/login.html', {'error': 'Invalid credentials'})
    
    return render(request, 'monitoring/login.html')

def logout_view(request):
    logout(request)
    return redirect('login')

@login_required
def dashboard_view(request):
    try:
        # Get all children for the current user
        children = ChildProfile.objects.filter(parent=request.user)
        
        # Get the first child's ID if available
        child_id = None
        if children.exists():
            child_id = children.first().id
            print(f"Found child ID: {child_id}")  # Debug logging
        else:
            print("No children found for user")  # Debug logging
        
        context = {
            'children': children,
            'child_id': child_id,
            'has_children': children.exists()
        }
        
        print(f"Rendering dashboard with context: {context}")  # Debug logging
        return render(request, 'dashboard.html', context)
        
    except Exception as e:
        print(f"Error in dashboard_view: {str(e)}")  # Debug logging
        return render(request, 'dashboard.html', {
            'error': 'An error occurred while loading the dashboard',
            'children': [],
            'child_id': None,
            'has_children': False
        })

@login_required
def get_activity_data(request):
    child_id = request.GET.get('child_id')
    if not child_id:
        return JsonResponse({'error': 'Child ID required'}, status=400)
    
    try:
        child = ChildProfile.objects.get(id=child_id, parent=request.user)
        activities = ActivityLog.objects.filter(child=child)
        
        data = {
            'activities': [{
                'type': activity.activity_type,
                'url': activity.url,
                'timestamp': activity.timestamp.isoformat(),
                'duration': activity.duration,
                'risk_level': activity.risk_level,
                'details': activity.details
            } for activity in activities]
        }
        return JsonResponse(data)
    except ChildProfile.DoesNotExist:
        return JsonResponse({'error': 'Child not found'}, status=404)

@login_required
def add_child(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        child = ChildProfile.objects.create(
            parent=request.user,
            name=data['name'],
            age=data['age']
        )
        return JsonResponse({
            'status': 'success',
            'child_id': child.id,
            'name': child.name
        })
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def log_activity(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        try:
            child = ChildProfile.objects.get(id=data['child_id'])
            activity = ActivityLog.objects.create(
                child=child,
                activity_type=data['activity_type'],
                url=data['url'],
                duration=data.get('duration', 0),
                risk_level=data.get('risk_level', 0),
                details=data.get('details', {})
            )
            return JsonResponse({'status': 'success', 'activity_id': activity.id})
        except ChildProfile.DoesNotExist:
            return JsonResponse({'error': 'Child not found'}, status=404)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@login_required
def children_list(request):
    children = ChildProfile.objects.filter(parent=request.user)
    data = {
        'children': [
            {'id': child.id, 'name': child.name}
            for child in children
        ]
    }
    return JsonResponse(data)

@csrf_exempt
def log_detection(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            print(f"Received detection data: {data}")  # Debug logging
            
            # Validate required fields
            required_fields = ['child_id', 'type', 'result']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                print(f"Missing required fields: {missing_fields}")
                return JsonResponse({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                }, status=400)

            try:
                child = ChildProfile.objects.get(id=data['child_id'])
            except ChildProfile.DoesNotExist:
                print(f"Child not found with ID: {data['child_id']}")
                return JsonResponse({'error': 'Child not found'}, status=404)

            # Process the result data
            result_data = data['result']
            detections = []

            # Handle video detection results
            if data['type'] == 'video':
                if 'brainrot' in result_data:
                    brainrot_data = result_data['brainrot']
                    detections.append({
                        'type': 'video',
                        'subtype': 'brainrot',
                        'result': brainrot_data,
                        'confidence': brainrot_data.get('confidence', 0),
                        'risk_level': 3 if brainrot_data.get('is_brainrot', False) else 0
                    })
                    print(f"Processing brainrot detection: {brainrot_data}")
                
                if 'violence' in result_data:
                    violence_data = result_data['violence']
                    detections.append({
                        'type': 'video',
                        'subtype': 'violence',
                        'result': violence_data,
                        'confidence': violence_data.get('confidence', 0),
                        'risk_level': 5 if violence_data.get('is_violence', False) else 0
                    })
                    print(f"Processing violence detection: {violence_data}")
                
                if 'deepfake' in result_data:
                    deepfake_data = result_data['deepfake']
                    detections.append({
                        'type': 'video',
                        'subtype': 'deepfake',
                        'result': deepfake_data,
                        'confidence': deepfake_data.get('confidence', 0),
                        'risk_level': 4 if deepfake_data.get('is_deepfake', False) else 0
                    })
                    print(f"Processing deepfake detection: {deepfake_data}")
            elif data['type'] == 'flash':
                # Handle flash detection results
                flash_data = result_data
                risk_level = 0
                if flash_data.get('is_epilepsy_trigger', False):
                    risk_level = 5  # High risk if flashing lights detected
                detections.append({
                    'type': 'flash',
                    'result': flash_data,
                    'confidence': flash_data.get('confidence', 0),
                    'risk_level': risk_level,
                    'details': {
                        'frame_count': flash_data.get('frame_count', 0),
                        'status': flash_data.get('status', 'unknown')
                    }
                })
                print(f"Processing flash detection: {flash_data}")
            else:
                # Handle other detection types
                detections.append({
                    'type': data['type'],
                    'result': result_data,
                    'confidence': result_data.get('confidence', 0),
                    'risk_level': data.get('risk_level', 0)
                })
                print(f"Processing {data['type']} detection: {result_data}")

            # Create detection logs
            created_detections = []
            for detection in detections:
                try:
                    detection_log = DetectionLog.objects.create(
                        child=child,
                        detection_type=detection['type'],
                        result=detection['result'],
                        confidence=detection['confidence'],
                        risk_level=detection['risk_level'],
                        details=detection.get('details', {}),
                        timestamp=timezone.now()
                    )
                    created_detections.append(detection_log)
                    print(f"Created detection log: {detection_log.id} for type {detection['type']} with confidence {detection['confidence']}")
                except Exception as e:
                    print(f"Error creating detection log: {str(e)}")
                    continue

            if not created_detections:
                print("No detections were created")
                return JsonResponse({'error': 'No detections were created'}, status=400)

            return JsonResponse({
                'status': 'success',
                'detection_ids': [d.id for d in created_detections],
                'timestamp': timezone.now().isoformat()
            })
        except json.JSONDecodeError:
            print("Invalid JSON data received")
            return JsonResponse({'error': 'Invalid JSON data'}, status=400)
        except Exception as e:
            print(f"Error processing detection: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

def get_detection_data(request):
    try:
        child_id = request.GET.get('child_id')
        if not child_id:
            return JsonResponse({'error': 'Child ID required'}, status=400)
        
        print(f"Fetching detection data for child_id: {child_id}")
        
        try:
            child = ChildProfile.objects.get(id=child_id, parent=request.user)
        except ChildProfile.DoesNotExist:
            print(f"Child not found with id: {child_id}")
            return JsonResponse({'error': 'Child not found'}, status=404)
        
        # Get recent detections (last 24 hours)
        recent_detections = DetectionLog.objects.filter(
            child=child,
            timestamp__gte=timezone.now() - timedelta(hours=24)
        ).order_by('-timestamp')
        
        print(f"Found {recent_detections.count()} recent detections")
        
        # Get detection analytics
        try:
            detection_stats = recent_detections.values('detection_type').annotate(
                count=Count('id'),
                avg_confidence=Avg('confidence'),
                avg_risk=Avg('risk_level')
            )
            print(f"Generated stats for {len(detection_stats)} detection types")
        except Exception as e:
            print(f"Error generating detection stats: {str(e)}")
            detection_stats = []
        
        # Get latest detections for each type
        latest_detections = {}
        for detection_type, _ in DetectionLog.DETECTION_TYPES:
            try:
                latest = recent_detections.filter(detection_type=detection_type).first()
                if latest:
                    latest_detections[detection_type] = {
                        'timestamp': latest.timestamp.isoformat(),
                        'result': latest.result,
                        'confidence': latest.confidence,
                        'risk_level': latest.risk_level,
                        'subtype': latest.details.get('subtype')
                    }
            except Exception as e:
                print(f"Error processing latest detection for type {detection_type}: {str(e)}")
        
        # Prepare recent detections data
        recent_data = []
        for d in recent_detections:  # All detections in the last 24 hours
            try:
                recent_data.append({
                    'type': d.detection_type,
                    'subtype': d.details.get('subtype'),
                    'timestamp': d.timestamp.isoformat(),
                    'result': d.result,
                    'confidence': d.confidence,
                    'risk_level': d.risk_level
                })
            except Exception as e:
                print(f"Error processing detection {d.id}: {str(e)}")
        
        data = {
            'stats': list(detection_stats),
            'latest': latest_detections,
            'recent': recent_data
        }
        
        print(f"Successfully prepared detection data with {len(recent_data)} recent detections")
        return JsonResponse(data)
        
    except Exception as e:
        print(f"Unexpected error in get_detection_data: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({
            'error': 'Internal server error',
            'details': str(e)
        }, status=500)

@login_required
def get_usage_pattern_data(request):
    try:
        child_id = request.GET.get('child_id')
        if not child_id:
            return JsonResponse({'error': 'Child ID required'}, status=400)
        
        print(f"Fetching usage pattern data for child_id: {child_id}")
        
        try:
            child = ChildProfile.objects.get(id=child_id, parent=request.user)
        except ChildProfile.DoesNotExist:
            print(f"Child not found with id: {child_id}")
            return JsonResponse({'error': 'Child not found'}, status=404)
        
        # Get recent activity logs (last 24 hours)
        activities = ActivityLog.objects.filter(
            child=child,
            timestamp__gte=timezone.now() - timedelta(hours=24)
        ).order_by('timestamp')
        
        print(f"Found {activities.count()} activity logs")
        
        # Process activities into patterns
        patterns = []
        for activity in activities:
            try:
                # Extract behavior from details or default to 'normal'
                behavior = activity.details.get('behavior', 'normal') if activity.details else 'normal'
                
                pattern = {
                    'timestamp': activity.timestamp.isoformat(),
                    'engagementDuration': activity.duration,
                    'behavior': behavior
                }
                patterns.append(pattern)
            except Exception as e:
                print(f"Error processing activity {activity.id}: {str(e)}")
                continue
        
        data = {
            'patterns': patterns
        }
        
        print(f"Successfully prepared usage pattern data with {len(patterns)} patterns")
        return JsonResponse(data)
        
    except Exception as e:
        print(f"Unexpected error in get_usage_pattern_data: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({
            'error': 'Internal server error',
            'details': str(e)
        }, status=500) 