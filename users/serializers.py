from rest_framework import serializers
from .models import User, Roles


class RolesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roles
        fields = ['id', 'role_name', 'role_description']


class UserSerializer(serializers.ModelSerializer):
    role_detail = RolesSerializer(source='role', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'firstname', 'lastname', 'username',
            'phone', 'address', 'town', 'role', 'role_detail',
            'avatar', 'date_of_birth', 'is_active', 'queue_status',
            'endpoint', 'lastevent', 'lastlogin', 'lastlogout'
        ]
        read_only_fields = ['id', 'date_joined', 'lastlogin', 'lastlogout']
