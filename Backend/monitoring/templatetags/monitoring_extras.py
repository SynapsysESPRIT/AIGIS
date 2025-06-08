from django import template

register = template.Library()

@register.filter(name='split')
def split_string(value, arg):
    """
    Splits a string by the given argument.
    Usage: {{ some_string|split:"," }}
    """
    if value is None:
        return []
    return str(value).split(str(arg))

@register.filter(name='strip')
def strip_string(value):
    """
    Strips whitespace from both ends of a string.
    Usage: {{ some_string|strip }}
    """
    if value is None:
        return ''
    return str(value).strip()

@register.filter(name='slice_filter') # Renamed to avoid conflict if 'slice' is a built-in or other custom filter
def slice_filter(value, arg):
    """
    Slices a list or string.
    Usage: {{ some_list|slice_filter:"1:" }} or {{ some_string|slice_filter:":-1" }}
    """
    try:
        if ':' in str(arg):
            parts = str(arg).split(':')
            start = int(parts[0]) if parts[0] else None
            end = int(parts[1]) if parts[1] else None
            if len(parts) > 2 and parts[2]: # step
                step = int(parts[2])
                return value[start:end:step]
            return value[start:end]
        else:
            return value[int(arg)]
    except (ValueError, TypeError):
        return value # or return empty list/string, or raise error

@register.filter(name='join_filter') # Renamed to avoid conflict
def join_filter(value, arg):
    """
    Joins a list of strings with the given argument.
    Usage: {{ some_list|join_filter:"," }}
    """
    if value is None:
        return ''
    return str(arg).join(map(str, value))

# Django already has a built-in 'lower' filter.
# If you need a custom one for some reason, you can define it.
# @register.filter(name='custom_lower')
# def custom_lower(value):
#     if value is None:
#         return ''
#     return str(value).lower()

