from django.urls import path
from . import views

urlpatterns = [
    path('infer/', views.infer_audio, name='infer_audio'),
]