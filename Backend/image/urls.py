from django.urls import path
from . import views

urlpatterns = [
    path('classify_nudity/', views.classify_nudity, name='classify_nudity'),
    path('proxy/', views.proxy_image, name='proxy_image'),
] 