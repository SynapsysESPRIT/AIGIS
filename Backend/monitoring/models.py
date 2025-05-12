from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class ParentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone_number = models.CharField(max_length=15, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

class ChildProfile(models.Model):
    parent = models.ForeignKey(User, on_delete=models.CASCADE, related_name='children')
    name = models.CharField(max_length=100)
    age = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name}'s Profile"

class ActivityLog(models.Model):
    ACTIVITY_TYPES = [
        ('BROWSING', 'Web Browsing'),
        ('VIDEO', 'Video Content'),
        ('IMAGE', 'Image Content'),
        ('TEXT', 'Text Content'),
        ('AUDIO', 'Audio Content'),
    ]

    child = models.ForeignKey(ChildProfile, on_delete=models.CASCADE, related_name='activities')
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    url = models.URLField()
    timestamp = models.DateTimeField(auto_now_add=True)
    duration = models.IntegerField(default=0)  # Duration in seconds
    risk_level = models.IntegerField(default=0)  # 0-5 scale for risk assessment
    details = models.JSONField(default=dict)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.child.name} - {self.activity_type} at {self.timestamp}"

class DetectionLog(models.Model):
    DETECTION_TYPES = [
        ('audio', 'Audio Analysis'),
        ('behavior', 'Behavior Analysis'),
        ('content', 'Content Safety'),
        ('text', 'Text Analysis'),
        ('usage', 'Usage Pattern'),
        ('video', 'Video Analysis'),
        ('flash', 'Flash Detection'),
    ]

    child = models.ForeignKey(ChildProfile, on_delete=models.CASCADE)
    detection_type = models.CharField(max_length=20, choices=DETECTION_TYPES)
    timestamp = models.DateTimeField(auto_now_add=True)
    result = models.JSONField()  # Store the full detection result
    confidence = models.FloatField(null=True, blank=True)
    risk_level = models.IntegerField(default=0)  # 0-5 scale
    details = models.JSONField(default=dict)

    class Meta:
        ordering = ['-timestamp'] 