from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"   # lets the frontend send ?page_size=500
    max_page_size = 1000