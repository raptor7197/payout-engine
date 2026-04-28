from django.test.runner import DiscoverRunner


class CoreTestRunner(DiscoverRunner):
    def build_suite(self, test_labels=None, extra_tests=None, **kwargs):
        if not test_labels:
            test_labels = ["core"]
        return super().build_suite(test_labels, extra_tests, **kwargs)
