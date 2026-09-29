#!/usr/bin/env python3
import os, sys, types
# Ensure script dir
script_dir = os.path.dirname(__file__)
if script_dir:
    os.chdir(script_dir)

# Monkeypatch pymongo.MongoClient before importing bot
import pymongo
class DummyCollection:
    def count_documents(self, q):
        return 0
    def insert_one(self, d):
        print("Inserted:", d)
class DummyClient:
    def __getitem__(self, name):
        # return a dummy object with expected attributes
        return types.SimpleNamespace(feedback=DummyCollection())

pymongo.MongoClient = lambda *a, **k: DummyClient()

# Prevent bot from trying to run polling by clearing token
os.environ['TELEGRAM_BOT_TOKEN'] = ''
os.environ['MONGODB_URI'] = 'mongodb://localhost:27017'

# Import bot module
import importlib
import bot
importlib.reload(bot)

print('search_gdb("brown planthopper") =>', bot.search_gdb('How to control brown planthopper?')['question'])
entry = bot.search_gdb('drip irrigation')
print('format_answer_text preview =>', bot.format_answer_text(entry, 'Best drip irrigation?')[:160])
print('format_feedback_question =>', bot.format_feedback_question())
