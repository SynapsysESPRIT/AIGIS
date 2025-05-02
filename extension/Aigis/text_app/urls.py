from django.urls import path
from . import views

urlpatterns = [
    path('', views.classify_text, name='classify_text'),
] 