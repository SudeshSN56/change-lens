from setuptools import setup, find_packages

setup(
    name="geo-indexer",
    version="1.0.0",
    packages=find_packages(include=["src", "src.*"]),
)
