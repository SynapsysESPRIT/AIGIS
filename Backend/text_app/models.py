from django.db import models

# Create your models here.

class TextClassification(models.Model):
    text = models.TextField()
    classification_result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Text Classification - {self.created_at}"
