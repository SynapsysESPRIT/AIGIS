from django.urls import path
from . import views

urlpatterns = [
    path('infer_audio/', views.infer_audio),
] 